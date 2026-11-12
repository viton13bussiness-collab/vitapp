// VIT as a desktop window. The same server runs inside the app; if the app's Node cannot run it, the system Node does.
const { app, BrowserWindow, shell, session, desktopCapturer } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Electron 42 crashed its GPU process on macOS 26 the moment a page asked for WebGL; the workaround (OpenGL backend) cost 80% of the frame rate.
// Electron 45.1 runs WebGL on Metal without crashing, so the fast default stays. VIT_ANGLE=gl brings the old workaround back if a machine needs it.
if (process.platform === 'darwin' && process.env.VIT_ANGLE) app.commandLine.appendSwitch('use-angle', process.env.VIT_ANGLE);
app.setName('VITON13');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.VIT_PORT || 5313);
const url = `http://127.0.0.1:${PORT}`;
let child = null;

const alive = async () => { try { return (await (await fetch(url + '/api/health', { signal: AbortSignal.timeout(1500) })).json()).ok === true; } catch { return false; } };
async function ensureServer() {
  if (await alive()) return;                                             // `npm start` is already running — use it
  if (app.isPackaged) process.env.VIT_DATA ||= path.join(app.getPath('userData'), 'data');
  try { const { start } = await import(path.join(ROOT, 'server', 'index.mjs')); await start(PORT); return; }
  catch (e) { console.error('[vit] in-app server failed, starting with system Node:', e.message); }
  child = spawn('node', [path.join(ROOT, 'server', 'index.mjs')], { env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }, stdio: 'inherit' });
  for (let i = 0; i < 40 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 250));
}

async function boot() {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(path.join(__dirname, 'icon.png'));        // the globe mark in the Dock while running from source
  await ensureServer();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'media'));      // microphone and camera, nothing else
  // «Встречи»: sharing a screen or a window — macOS shows its own picker; without it the first screen is offered
  session.defaultSession.setDisplayMediaRequestHandler((_req, done) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((s) => done(s[0] ? { video: s[0], audio: 'loopback' } : {})).catch(() => done({}));
  }, { useSystemPicker: true });
  const win = new BrowserWindow({ width: 1180, height: 800, minWidth: 380, minHeight: 560, title: 'VITON13', backgroundColor: '#0b0a09', icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 18, y: 18 }, webPreferences: { contextIsolation: true, sandbox: true, webviewTag: true } });
  win.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith(url)) return { action: 'allow' }; if (/^https?:\/\//.test(target)) shell.openExternal(target); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, target) => { if (!target.startsWith(url)) { e.preventDefault(); if (/^https?:\/\//.test(target)) shell.openExternal(target); } });
  win.loadURL(url);
}
app.whenReady().then(boot);

// Meridian, the browser inside VITON13: pages open in <webview> tags with their own session, no Node, no preload, nothing of the app.
const BROWSER = 'persist:meridian';
app.whenReady().then(() => {
  const ses = session.fromPartition(BROWSER);
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|VITON13|viton13)\/\S+/g, ''));                       // sites see an ordinary Chrome
  ses.setPermissionRequestHandler((_wc, permission, done) => done(['fullscreen', 'clipboard-sanitized-write'].includes(permission)));
});
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload; Object.assign(prefs, { nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, webSecurity: true });
    params.partition = BROWSER;
    if (!/^(https?:|about:blank)/.test(params.src || 'about:blank')) e.preventDefault();
  });
  if (wc.getType() !== 'webview') return;
  // a link that wants a new window becomes a new Meridian tab
  wc.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) wc.hostWebContents?.executeJavaScript(`window.dispatchEvent(new CustomEvent('meridian:open', { detail: ${JSON.stringify(target)} }))`).catch(() => {});
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, target) => { if (!/^https?:/.test(target)) e.preventDefault(); });
  // Meridian's shortcuts keep working while a page has the focus
  wc.on('before-input-event', (e, input) => {
    const k = String(input.key || '').toLowerCase();
    if (input.type !== 'keyDown' || !(input.meta || input.control) || input.alt || !['l', 't', 'w', 'r', '[', ']', 'f'].includes(k)) return;
    e.preventDefault(); wc.hostWebContents?.executeJavaScript(`window.dispatchEvent(new CustomEvent('meridian:key', { detail: ${JSON.stringify(k)} }))`).catch(() => {});
  });
});
// `--gpu-report=<file>` writes what the graphics stack can do — for diagnosing a window where 3D does not start
{ const out = process.argv.find((a) => a.startsWith('--gpu-report='))?.slice(13), gone = [];
  if (out) { app.on('child-process-gone', (_e, d) => gone.push(d));
    app.whenReady().then(() => setTimeout(async () => require('node:fs').writeFileSync(out, JSON.stringify({ status: app.getGPUFeatureStatus(), gone, info: await app.getGPUInfo('basic').catch((e) => String(e)) }, null, 1)), 5000)); } }
app.on('window-all-closed', () => app.quit());
app.on('quit', () => child?.kill());
