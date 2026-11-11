// VIT as a desktop window. The same server runs inside the app; if the app's Node cannot run it, the system Node does.
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

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
  const win = new BrowserWindow({ width: 1180, height: 800, minWidth: 380, minHeight: 560, title: 'VIT', backgroundColor: '#0c0c0f', icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 18, y: 18 }, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith(url)) return { action: 'allow' }; if (/^https?:\/\//.test(target)) shell.openExternal(target); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, target) => { if (!target.startsWith(url)) { e.preventDefault(); if (/^https?:\/\//.test(target)) shell.openExternal(target); } });
  win.loadURL(url);
}
app.whenReady().then(boot);
app.on('window-all-closed', () => app.quit());
app.on('quit', () => child?.kill());
