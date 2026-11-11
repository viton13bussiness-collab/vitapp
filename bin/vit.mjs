#!/usr/bin/env node
// `npm start` — runs VIT on this computer and opens it in the browser.
import { spawn } from 'node:child_process';
import { start } from '../server/index.mjs';
import { PORT } from '../server/config.mjs';

const port = await start(PORT).catch((e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${PORT} занят. Запустите так: VIT_PORT=5314 npm start` : e); process.exit(1); });
if (!process.argv.includes('--no-open')) {
  const url = `http://localhost:${port}`, cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* open it by hand */ }
}
