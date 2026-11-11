// Paths, port and .env. Everything VIT stores lives in DATA (one SQLite file + the agents' workspace).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
export const VERSION = '0.1.0';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
export const PORT = +(arg('port') || process.env.VIT_PORT || 5313);
export const HOST = process.env.VIT_HOST || '127.0.0.1';
export const DATA = path.resolve(arg('data') || process.env.VIT_DATA || path.join(ROOT, 'data'));
export const WORK = path.join(DATA, 'workspace');
export const WEB = path.join(ROOT, 'web');
fs.mkdirSync(WORK, { recursive: true });
