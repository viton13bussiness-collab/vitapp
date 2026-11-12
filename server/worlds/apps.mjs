// «Приложения»: open-source macOS apps that ship real GitHub Releases. Find them, download the build for this Mac into
// ~/Downloads/VITON13 Apps, open it with the person's own click. Nothing here installs, unpacks or runs anything on its own,
// and the downloaded file gets the same quarantine mark a browser would set, so macOS (Gatekeeper) asks the person as usual.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { DATA } from '../config.mjs';
import { can } from '../plan.mjs';

const API = 'https://api.github.com', UA = 'VITON13-Apps/0.3 (+https://viton13.com)';
const DIR = path.join(os.homedir(), 'Downloads', 'VITON13 Apps');
const MANIFEST = path.join(DATA, 'apps.json'), CACHE_FILE = path.join(DATA, 'apps-cache.json');
const ARM = process.arch === 'arm64';
const DRY = process.env.VIT_APPS_DRYRUN === '1';                       // tests: log the command instead of running it
const HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const HOUR = 3600e3;

// Every repo below was checked against the GitHub API on 13.11.2026: it exists, is open source and its latest release has a macOS build.
export const CATALOG = [
  { repo: 'rxhanson/Rectangle', name: 'Rectangle', cat: 'utils', license: 'MIT', text: 'Раскладывает окна по краям и углам экрана — клавишами или перетаскиванием.' },
  { repo: 'exelban/stats', name: 'Stats', cat: 'utils', license: 'MIT', text: 'Монитор системы в строке меню: процессор, память, диск, сеть, батарея.' },
  { repo: 'p0deje/Maccy', name: 'Maccy', cat: 'utils', license: 'MIT', text: 'Лёгкий менеджер буфера обмена: вся история скопированного по одному сочетанию клавиш.' },
  { repo: 'lwouis/alt-tab-macos', name: 'AltTab', cat: 'utils', license: 'GPL-3.0', text: 'Переключение окон как в Windows: превью каждого окна по ⌥Tab.' },
  { repo: 'MonitorControl/MonitorControl', name: 'MonitorControl', cat: 'utils', license: 'MIT', text: 'Яркость и громкость внешнего монитора с клавиатуры — как у дисплея Apple.' },
  { repo: 'jordanbaird/Ice', name: 'Ice', cat: 'utils', license: 'GPL-3.0', text: 'Порядок в строке меню: прячет, группирует и переставляет значки.' },
  { repo: 'dwarvesf/hidden', name: 'Hidden Bar', cat: 'utils', license: 'MIT', text: 'Прячет лишние значки строки меню одним щелчком.' },
  { repo: 'iina/iina', name: 'IINA', cat: 'media', license: 'GPL-3.0', text: 'Современный видеоплеер для Mac: любые форматы, субтитры, картинка в картинке.' },
  { repo: 'HandBrake/HandBrake', name: 'HandBrake', cat: 'media', license: 'GPL-2.0', text: 'Перекодирует видео в нужный формат и размер — для телефона, сайта или архива.', skip: /cli/i },
  { repo: 'mifi/lossless-cut', name: 'LosslessCut', cat: 'media', license: 'GPL-2.0', text: 'Режет и склеивает видео и звук без перекодирования и потери качества.' },
  { repo: 'obsproject/obs-studio', name: 'OBS Studio', cat: 'create', license: 'GPL-2.0', text: 'Запись экрана и прямые трансляции: сцены, источники, микшер звука.' },
  { repo: 'wulkano/Kap', name: 'Kap', cat: 'create', license: 'MIT', text: 'Запись экрана в видео или GIF за пару щелчков.' },
  { repo: 'objective-see/LuLu', name: 'LuLu', cat: 'security', license: 'GPL-3.0', text: 'Бесплатный файрвол: показывает исходящие подключения программ и даёт их запретить.' },
  { repo: 'keepassxreboot/keepassxc', name: 'KeePassXC', cat: 'security', license: 'GPL-3.0', text: 'Менеджер паролей: зашифрованная база лежит у вас, без облака.' },
  { repo: 'VSCodium/vscodium', name: 'VSCodium', cat: 'dev', license: 'MIT', text: 'Редактор кода VS Code в открытой сборке — без телеметрии Microsoft.' },
];
export const CATS = [['utils', 'Утилиты'], ['media', 'Медиа'], ['create', 'Творчество'], ['security', 'Безопасность'], ['dev', 'Разработка']];

// ── GitHub, gently: one cache for everything, kept on disk so a restart does not spend the hourly limit again ──
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* first run */ }
let saveT = 0; const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch { /* read-only data dir */ } }, 400); };
let limitedUntil = 0;
const rateError = () => Object.assign(new Error('GitHub попросил подождать: лимит запросов без входа — 60 в час. Каталог работает из сохранённого, поиск оживёт к ' + new Date(limitedUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '.'), { rate: true });

async function gh(url, ttl = HOUR) {
  const hit = cache[url];
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (Date.now() < limitedUntil) { if (hit) return hit.data; throw rateError(); }
  const headers = { 'user-agent': UA, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let r; try { r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) }); } catch (e) { if (hit) return hit.data; throw Object.assign(new Error('GitHub сейчас не отвечает'), { offline: true }); }
  if ((r.status === 403 || r.status === 429) && (r.headers.get('x-ratelimit-remaining') === '0' || r.status === 429)) {
    limitedUntil = (Number(r.headers.get('x-ratelimit-reset')) || Date.now() / 1000 + 600) * 1000;
    if (hit) return hit.data; throw rateError();
  }
  if (r.status === 404) { cache[url] = { at: Date.now(), data: null }; persist(); return null; }
  if (!r.ok) { if (hit) return hit.data; throw new Error('GitHub ответил ' + r.status); }
  const data = JSON.parse(await r.text().then((t) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')));
  cache[url] = { at: Date.now(), data }; persist(); return data;
}

// ── which file of a release is the one for this Mac ──
const BAD = /dsym|pdb|symbols|debug|src|source|appimage|flatpak|[-_.]snap[-_.]|debian|ubuntu|fedora|\.msi|win(32|64|dows)?[-_.]|linux|\.sig$|\.sha|dont[-_]?use|appcast|delta|blockmap/i;
const MACWORD = /mac|darwin|osx|apple|universal|\.app\.zip/i;
const archOf = (n) => (/universal/i.test(n) ? 'universal' : /arm64|aarch64|apple(?!.*intel)|[-_.]arm[-_.]/i.test(n) ? 'arm' : /x86[-_]?64|x64|intel|amd64/i.test(n) ? 'intel' : 'any');
export function pickAsset(assets, { macOnly = false, skip = null } = {}) {
  const ok = (assets || []).filter((a) => /\.(dmg|pkg|zip)$/i.test(a.name) && !BAD.test(a.name) && !(skip && skip.test(a.name)) && a.state !== 'deleted'
    && (macOnly || /\.(dmg|pkg)$/i.test(a.name) || MACWORD.test(a.name)) && !/windows|win_gui/i.test(a.name));
  const score = (a) => { const k = archOf(a.name); let s = ARM ? { arm: 4, universal: 3, any: 2, intel: -6 }[k] : { intel: 4, universal: 3, any: 2, arm: -6 }[k];
    if (/\.dmg$/i.test(a.name)) s += 1; else if (/\.pkg$/i.test(a.name)) s += 0.5; if (/cli/i.test(a.name)) s -= 2; return s; };
  const best = ok.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s)[0];
  return best && best.s > -1 ? best.a : null;
}
const shapeAsset = (a) => a && { name: a.name, size: a.size, url: a.browser_download_url, arch: archOf(a.name), kind: a.name.split('.').pop().toLowerCase() };

async function releaseOf(repo, opts) {
  const rel = await gh(`${API}/repos/${repo}/releases/latest`);
  if (!rel) return null;
  const asset = pickAsset(rel.assets, opts);
  return { version: String(rel.tag_name || rel.name || '').replace(/^v(?=\d)/, ''), date: rel.published_at, url: rel.html_url, asset: shapeAsset(asset) };
}
const repoShape = (x) => x && { repo: x.full_name, stars: x.stargazers_count, homepage: /^https?:\/\//.test(x.homepage || '') ? x.homepage : '', avatar: x.owner?.avatar_url && x.owner.type === 'Organization' ? x.owner.avatar_url + '&s=128' : '',              // a person's photo is not an app icon
  license: x.license && x.license.spdx_id !== 'NOASSERTION' ? x.license.spdx_id : '', description: String(x.description || '').slice(0, 200), url: x.html_url, pushed: x.pushed_at };

async function catalog() {
  const q = CATALOG.map((c) => 'repo:' + c.repo).join('+');
  let meta = {}, note = '';
  try { const d = await gh(`${API}/search/repositories?q=${q}&per_page=50`, 6 * HOUR); for (const x of d?.items || []) meta[x.full_name.toLowerCase()] = repoShape(x); }
  catch (e) { note = e.message; }
  const items = await Promise.all(CATALOG.map(async (c) => {
    let rel = null; try { rel = await releaseOf(c.repo, { macOnly: true, skip: c.skip }); } catch (e) { note ||= e.message; }
    const m = meta[c.repo.toLowerCase()] || {};
    return { ...m, repo: c.repo, name: c.name, cat: c.cat, text: c.text, license: c.license, url: m.url || `https://github.com/${c.repo}`, avatar: m.avatar || '', release: rel };
  }));
  return { items, note };
}

async function search(q) {
  const term = String(q || '').replace(/[^\p{L}\p{N}\s.+#-]/gu, ' ').trim().slice(0, 80);
  if (term.length < 2) return { items: [], note: '' };
  const d = await gh(`${API}/search/repositories?q=${encodeURIComponent(term + ' fork:false archived:false')}&sort=stars&per_page=14`, 30 * 60e3);
  const repos = (d?.items || []).map(repoShape).slice(0, 14);
  const known = new Map(CATALOG.map((c) => [c.repo.toLowerCase(), c]));
  // check releases for the first ten (each costs one request) — only repos with a real build for a Mac come back
  const checked = await Promise.all(repos.slice(0, 10).map(async (r) => { try { const c = known.get(r.repo.toLowerCase()); return { ...r, name: c?.name || r.repo.split('/')[1], text: c?.text || r.description, cat: c?.cat || '', release: await releaseOf(r.repo, c ? { macOnly: true, skip: c.skip } : {}) }; } catch (e) { return { ...r, name: r.repo.split('/')[1], text: r.description, release: null, error: e.message }; } }));
  return { items: checked.filter((r) => r.release?.asset), web: checked.filter((r) => !r.release?.asset && r.homepage).slice(0, 4), total: d?.total_count || 0, note: '' };
}

// ── downloads ──
const readManifest = () => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; } };
const writeManifest = (m) => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 1));
const inDir = (name) => { const base = path.basename(String(name || '')); const full = path.join(DIR, base); return base && !base.startsWith('.') && full.startsWith(DIR + path.sep) ? full : null; };
const cleanName = (n) => path.basename(String(n)).replace(/[^\w.\-+() ]/g, '_').slice(0, 160);
const jobs = new Map();
const pubJob = (j) => ({ id: j.id, repo: j.repo, name: j.name, file: j.file, total: j.total, got: j.got, status: j.status, sha256: j.sha256 || '', error: j.error || '', version: j.version });

async function follow(url, signal) {                              // https only, and only through GitHub's own hosts
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(url); if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw new Error('Файл лежит не на GitHub — скачивание остановлено');
    const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'application/octet-stream' }, signal });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok || !r.body) throw new Error('GitHub не отдал файл (' + r.status + ')');
    return r;
  }
  throw new Error('Слишком много переадресаций');
}
const quarantine = (file) => new Promise((res) => {                // the mark Safari would set: Gatekeeper checks the app when the person opens it
  const val = `0081;${Math.floor(Date.now() / 1000).toString(16)};VITON13;${crypto.randomUUID().toUpperCase()}`;
  if (process.platform !== 'darwin') return res(false);
  execFile('xattr', ['-w', 'com.apple.quarantine', val, file], (err) => res(!err));
});

async function startDownload(user, repo, assetName) {
  const c = CATALOG.find((x) => x.repo.toLowerCase() === String(repo).toLowerCase());
  const rel = await releaseOf(repo, c ? { macOnly: true, skip: c.skip } : {});
  if (!rel?.asset) throw Object.assign(new Error('У этого проекта нет сборки для Mac'), { user: true });
  const asset = assetName && rel.asset.name !== assetName ? null : rel.asset;
  if (!asset) throw Object.assign(new Error('Файл обновился — откройте карточку ещё раз'), { user: true });
  return fetchAsset(user, { repo, name: c?.name || repo.split('/')[1], version: rel.version }, asset);
}
/** Download one release asset into the folder (exported for tests with small, non-executable files). */
export function fetchAsset(user, { repo, name, version }, asset) {
  const file = cleanName(asset.name), full = inDir(file);
  const running = [...jobs.values()].find((j) => j.file === file && j.status === 'run'); if (running) return running;
  fs.mkdirSync(DIR, { recursive: true });
  const id = crypto.randomBytes(6).toString('hex'), ac = new AbortController();
  const job = { id, user: user.id, repo, name, file, total: asset.size, got: 0, status: 'run', version, ac };
  jobs.set(id, job);
  // already here with the right size → just record it
  if (fs.existsSync(full) && fs.statSync(full).size === asset.size) { finish(job, full).catch(() => {}); return job; }
  (async () => {
    const part = full + '.part', hash = crypto.createHash('sha256');
    try {
      const r = await follow(asset.url, ac.signal), out = fs.createWriteStream(part);
      for await (const chunk of r.body) { if (ac.signal.aborted) throw new Error('Отменено'); hash.update(chunk); job.got += chunk.length; if (!out.write(chunk)) await new Promise((ok) => out.once('drain', ok)); }
      await new Promise((ok, no) => out.end((e) => (e ? no(e) : ok())));
      if (job.got !== asset.size) throw new Error(`Размер не совпал: получено ${job.got} из ${asset.size} байт`);
      fs.renameSync(part, full); job.sha256 = hash.digest('hex'); await finish(job, full);
    } catch (e) { job.status = 'fail'; job.error = ac.signal.aborted ? 'Отменено' : e.message; fs.rmSync(part, { force: true }); }
  })();
  return job;
}
async function finish(job, full) {
  if (!job.sha256) job.sha256 = await new Promise((ok, no) => { const h = crypto.createHash('sha256'); fs.createReadStream(full).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });
  job.quarantined = await quarantine(full);
  const m = readManifest().filter((x) => !(x.file === job.file && x.user === job.user));
  m.unshift({ user: job.user, file: job.file, repo: job.repo, name: job.name, version: job.version, size: job.total, sha256: job.sha256, at: Date.now() }); writeManifest(m);
  job.got = job.total; job.status = 'done';
}

// ── opening is always the person's click; macOS takes it from there ──
const run = (cmd, args) => new Promise((ok, no) => { if (DRY) { console.log('[apps dry-run]', cmd, ...args); return ok({ dry: true, cmd: [cmd, ...args].join(' ') }); } execFile(cmd, args, { timeout: 120000 }, (e) => (e ? no(e) : ok({}))); });
function findApp(dir, depth = 2) {
  let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) if (e.isDirectory() && e.name.endsWith('.app')) return path.join(dir, e.name);
  if (depth) for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX') { const f = findApp(path.join(dir, e.name), depth - 1); if (f) return f; }
  return null;
}
async function openFile(user, file, reveal) {
  const entry = readManifest().find((x) => x.file === file && x.user === user.id), full = entry && inDir(file);
  if (!full || !fs.existsSync(full)) throw Object.assign(new Error('Файла уже нет в папке загрузок'), { user: true });
  if (reveal) return run('open', ['-R', full]);
  if (/\.(dmg|pkg)$/i.test(file)) return run('open', [full]);                       // macOS mounts the disk image / shows the installer
  if (!/\.zip$/i.test(file)) return run('open', ['-R', full]);                           // anything else: just show it
  const out = full.replace(/\.zip$/i, '');
  if (!fs.existsSync(out)) { fs.mkdirSync(out, { recursive: true }); await run('ditto', ['-x', '-k', full, out]); }   // ditto keeps the quarantine mark on what it unpacks
  const app = findApp(out); return app ? run('open', [app]) : run('open', [out]);
}

export const _jobs = jobs;
export async function handle({ url, seg, method, json, fail, user, body }) {
  if (seg[1] !== 'apps') return false;
  const guest = !can(user, 'apps'), need = () => fail(402, 'Скачивание приложений недоступно на вашем уровне');
  try {
    if (!seg[2] && method === 'GET') { const { items, note } = await catalog(); json(200, { ok: true, cats: CATS, items, note, arch: ARM ? 'Apple Silicon' : 'Intel', dir: DIR.replace(os.homedir(), '~'), dry: DRY }); return true; }
    if (seg[2] === 'search' && method === 'GET') { json(200, { ok: true, ...(await search(url.searchParams.get('q'))) }); return true; }
    if (seg[2] === 'mine' && method === 'GET') {
      const items = readManifest().filter((x) => x.user === user.id).map((x) => { const full = inDir(x.file); return { ...x, here: !!full && fs.existsSync(full), unpacked: !!full && /\.zip$/i.test(x.file) && fs.existsSync(full.replace(/\.zip$/i, '')) }; });
      json(200, { ok: true, items, jobs: [...jobs.values()].filter((j) => j.user === user.id).map(pubJob) }); return true;
    }
    if (seg[2] === 'download' && method === 'POST') { if (guest) { need(); return true; } const b = await body(); if (!/^[\w.-]+\/[\w.-]+$/.test(b.repo || '')) { fail(400, 'Нет такого проекта'); return true; }
      json(200, { ok: true, job: pubJob(await startDownload(user, b.repo, b.asset)) }); return true; }
    if (seg[2] === 'jobs' && seg[3] && method === 'DELETE') { const j = jobs.get(seg[3]); if (j && j.user === user.id) { j.ac.abort(); if (j.status !== 'run') jobs.delete(j.id); } json(200, { ok: true }); return true; }
    if ((seg[2] === 'open' || seg[2] === 'reveal') && method === 'POST') { if (guest) { need(); return true; } const b = await body(); const r = await openFile(user, path.basename(String(b.file || '')), seg[2] === 'reveal'); json(200, { ok: true, ...r }); return true; }
    if (seg[2] === 'mine' && seg[3] && method === 'DELETE') {
      const file = path.basename(decodeURIComponent(seg[3])), m = readManifest(), entry = m.find((x) => x.file === file && x.user === user.id), full = entry && inDir(file);
      if (!full) { fail(404, 'Нет такой загрузки'); return true; }
      fs.rmSync(full, { force: true }); if (/\.zip$/i.test(file)) fs.rmSync(full.replace(/\.zip$/i, ''), { recursive: true, force: true });
      writeManifest(m.filter((x) => x !== entry)); json(200, { ok: true }); return true;
    }
  } catch (e) { fail(e.user ? 400 : e.rate ? 429 : e.offline ? 503 : 500, e.user || e.rate || e.offline ? e.message : 'Не получилось: ' + e.message); return true; }
  return false;
}
