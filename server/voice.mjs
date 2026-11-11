// Speech to text on this computer with whisper.cpp. No model → the app keeps working by text.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { DATA } from './config.mjs';
import { getSetting } from './db.mjs';

const which = (bin) => { for (const d of [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin']) { const p = path.join(d, bin); if (d && fs.existsSync(p)) return p; } return ''; };
const exec = (bin, args, ms) => new Promise((res, rej) => execFile(bin, args, { timeout: ms, maxBuffer: 4e6 }, (e, out) => (e ? rej(e) : res(out))));

function findModel() {
  const set = getSetting('voice', {}).model || process.env.VIT_WHISPER_MODEL; if (set && fs.existsSync(set)) return set;
  for (const dir of [path.join(DATA, 'models'), path.join(os.homedir(), '.vit', 'models'), '/opt/homebrew/share/whisper-cpp']) {
    try { const f = fs.readdirSync(dir).filter((n) => /^ggml-.*\.bin$/.test(n)).sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size)[0]; if (f) return path.join(dir, f); } catch { /* no such folder */ }
  }
  return '';
}
export function voiceStatus() { const whisper = which('whisper-cli') || which('whisper-cpp'), ffmpeg = which('ffmpeg'), model = findModel(); return { stt: !!(whisper && ffmpeg && model), whisper: !!whisper, ffmpeg: !!ffmpeg, model: model ? path.basename(model) : '' }; }

export async function transcribe(buf) {
  const whisper = which('whisper-cli') || which('whisper-cpp'), ffmpeg = which('ffmpeg'), model = findModel();
  if (!whisper || !ffmpeg || !model) { const e = new Error('Распознавание речи не настроено'); e.code = 'NO_STT'; throw e; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vit-voice-')), src = path.join(dir, 'in.webm'), wav = path.join(dir, 'in.wav');
  try {
    fs.writeFileSync(src, buf);
    await exec(ffmpeg, ['-v', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', wav], 20000);
    const out = await exec(whisper, ['-m', model, '-f', wav, '-l', 'auto', '-nt', '-np'], 60000);
    return out.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
