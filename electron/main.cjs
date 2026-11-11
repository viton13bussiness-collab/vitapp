// VIT as a desktop window. The same server runs inside the app; if the app's Node cannot run it, the system Node does.
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

// On Apple silicon with macOS 26 the default Metal graphics backend of this Electron crashes its GPU process the moment a page asks for WebGL,
// and every 3D screen (Медицина, the cosmos) silently loses its canvas. The OpenGL backend runs on the same GPU and does not crash.
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-angle', process.env.VIT_ANGLE || 'gl');
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
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'media'));      // the microphone, nothing else
  const win = new BrowserWindow({ width: 1180, height: 800, minWidth: 380, minHeight: 560, title: 'VITON13', backgroundColor: '#0b0a09', icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 18, y: 18 }, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith(url)) return { action: 'allow' }; if (/^https?:\/\//.test(target)) shell.openExternal(target); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, target) => { if (!target.startsWith(url)) { e.preventDefault(); if (/^https?:\/\//.test(target)) shell.openExternal(target); } });
  win.loadURL(url);
}
app.whenReady().then(boot);
// `--gpu-report=<file>` writes what the graphics stack can do — for diagnosing a window where 3D does not start
{ const out = process.argv.find((a) => a.startsWith('--gpu-report='))?.slice(13), gone = [];
  if (out) { app.on('child-process-gone', (_e, d) => gone.push(d));
    app.whenReady().then(() => setTimeout(async () => require('node:fs').writeFileSync(out, JSON.stringify({ status: app.getGPUFeatureStatus(), gone, info: await app.getGPUInfo('basic').catch((e) => String(e)) }, null, 1)), 5000)); } }
app.on('window-all-closed', () => app.quit());
app.on('quit', () => child?.kill());
