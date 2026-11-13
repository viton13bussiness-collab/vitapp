// Music world: internet radio (Radio Browser, an open community catalogue), free music from the Internet Archive
// (Creative Commons and public domain only, with the licence on every track), podcasts (Apple's public catalogue + the
// shows' own RSS), and the person's own files from ~/Music. Only metadata passes through here; streams play from their
// own addresses, except local files, which this route serves with Range so seeking works.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, all, one, run, now } from '../db.mjs';
import { DATA } from '../config.mjs';
import { can } from '../plan.mjs';
import { siteCall, siteMode, SITE } from './messages.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS music_likes (user TEXT, key TEXT, track TEXT, created INTEGER, PRIMARY KEY (user, key));
CREATE TABLE IF NOT EXISTS music_recent (user TEXT, key TEXT, track TEXT, played INTEGER, PRIMARY KEY (user, key));
CREATE TABLE IF NOT EXISTS music_playlists (id INTEGER PRIMARY KEY, user TEXT, title TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS music_playlist_items (pl INTEGER, key TEXT, track TEXT, pos INTEGER, PRIMARY KEY (pl, key));
CREATE TABLE IF NOT EXISTS music_uploads (id TEXT PRIMARY KEY, user TEXT, name TEXT, file TEXT, type TEXT, size INTEGER, title TEXT, artist TEXT, album TEXT, duration REAL, cover TEXT, cloud TEXT, created INTEGER);
CREATE INDEX IF NOT EXISTS music_uploads_user ON music_uploads (user, created);`);

const UA = 'VITON13/0.3 (desktop app; radio player)';
const bad = (msg) => Object.assign(new Error(msg), { user: true });

// ── a small cache for external JSON ─────────────────────────────────────────
const cache = new Map();
async function cached(key, ttl, fn) {
  const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn(); cache.set(key, { value, until: Date.now() + ttl });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return value;
}
async function getJSON(url, ms = 9000) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json();
}
async function getText(url, ms = 12000) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text();
}
const https = (u) => (typeof u === 'string' && /^https:\/\//i.test(u.trim()) ? u.trim() : '');
const clip = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── radio ───────────────────────────────────────────────────────────────────
// Radio Browser runs several mirrors; ask the list once, fall back to a known one.
let radioBase = null;
async function radioHost() {
  if (radioBase) return radioBase;
  try { const list = await getJSON('https://all.api.radio-browser.info/json/servers', 5000); const names = [...new Set(list.map((s) => s.name).filter(Boolean))]; radioBase = names.length ? `https://${names[Math.floor(Math.random() * names.length)]}` : null; } catch { /* use the default */ }
  return (radioBase ||= 'https://de1.api.radio-browser.info');
}
async function radio(pathAndQuery) {
  const base = await radioHost();
  try { return await getJSON(base + pathAndQuery); } catch (e) { radioBase = null; return getJSON('https://de1.api.radio-browser.info' + pathAndQuery); }
}
const COUNTRY = (() => { try { return new Intl.DisplayNames(['ru'], { type: 'region' }); } catch { return null; } })();
const countryName = (s) => { try { return (s.countrycode && COUNTRY?.of(s.countrycode)) || s.country || ''; } catch { return s.country || ''; } };
// Chromium plays MP3/AAC/OGG streams; HLS playlists and http-only streams are left out (the app page is local, mixed content is blocked).
const playable = (s) => https(s.url_resolved || s.url) && !s.hls && !/\.m3u8|\.pls|\.m3u(\?|$)/i.test(s.url_resolved || s.url) && (!s.codec || /mp3|aac|ogg|opus|unknown/i.test(s.codec));
const station = (s) => ({ key: 'radio:' + s.stationuuid, kind: 'radio', live: true, id: s.stationuuid, title: clip(s.name, 90), artist: clip([countryName(s), s.tags?.split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · '), 90),
  cover: https(s.favicon), src: https(s.url_resolved || s.url), link: https(s.homepage), plays: s.clickcount || 0, votes: s.votes || 0, codec: s.codec || '', bitrate: s.bitrate || 0, country: s.countrycode || '' });
const stations = (list, n) => { const seen = new Set(); return list.filter(playable).map(station).filter((s) => { const k = s.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n); };
export const TAGS = [['lofi', 'Lo-fi'], ['jazz', 'Джаз'], ['classical', 'Классика'], ['electronic', 'Электроника'], ['chillout', 'Чилл'], ['rock', 'Рок'], ['pop', 'Поп'], ['hip hop', 'Хип-хоп'], ['ambient', 'Эмбиент'], ['news', 'Новости']];
const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();
const radioTop = () => cached('radio:top', 30 * 60e3, async () => stations(await radio('/json/stations/topclick/120?hidebroken=true'), 40));
const radioRu = () => cached('radio:ru', 30 * 60e3, async () => stations(await radio('/json/stations/search?' + q({ countrycode: 'RU', order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: 150 })), 40));
const radioTag = (tag) => cached('radio:tag:' + tag, 30 * 60e3, async () => stations(await radio('/json/stations/search?' + q({ tag, tagExact: 'false', order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: 120 })), 40));
const radioFind = (name) => cached('radio:q:' + name, 10 * 60e3, async () => stations(await radio('/json/stations/search?' + q({ name, order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: 80 })), 30));

// ── Internet Archive: free music with a licence that allows listening and sharing ──
// Only the netlabels collection: releases put out by the labels themselves under Creative Commons (uploads elsewhere are often mislabelled).
const LICENSE = (u) => { const s = String(u || '').toLowerCase(); if (s.includes('publicdomain') || s.includes('/zero/')) return 'Общественное достояние';
  const m = s.match(/licenses\/([a-z-]+)\/([\d.]+)/); return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : s.includes('creativecommons') ? 'Creative Commons' : ''; };
const FREE = '(licenseurl:*creativecommons* OR licenseurl:*publicdomain*)';
const album = (d) => ({ id: d.identifier, title: clip(Array.isArray(d.title) ? d.title[0] : d.title, 100), artist: clip(Array.isArray(d.creator) ? d.creator.join(', ') : d.creator || 'Неизвестный автор', 90),
  cover: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`, license: LICENSE(d.licenseurl), licenseUrl: https(String(d.licenseurl || '').replace(/^http:/, 'https:')), link: `https://archive.org/details/${encodeURIComponent(d.identifier)}`, plays: d.downloads || 0 });
async function archiveSearch(text, rows = 24) {
  const query = `mediatype:audio AND ${FREE} AND collection:netlabels${text ? ` AND (title:(${text}) OR creator:(${text}) OR subject:(${text}))` : ''}`;
  const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams([['q', query], ['fl[]', 'identifier'], ['fl[]', 'title'], ['fl[]', 'creator'], ['fl[]', 'licenseurl'], ['fl[]', 'downloads'], ['sort[]', 'downloads desc'], ['rows', String(rows)], ['output', 'json']]);
  return (await getJSON(url, 12000)).response?.docs?.map(album) || [];
}
const archiveTop = () => cached('ia:top', 6 * 3600e3, () => archiveSearch('', 24));
const archiveFind = (text) => cached('ia:q:' + text, 30 * 60e3, () => archiveSearch(text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/\s+/).slice(0, 5).join(' AND '), 24));
const secs = (v) => { if (v == null) return 0; const s = String(v); if (s.includes(':')) return s.split(':').reduce((a, b) => a * 60 + Number(b || 0), 0); return Math.round(Number(s) || 0); };
async function archiveItem(id) {
  if (!/^[\w.-]{1,120}$/.test(id)) throw bad('Нет такого альбома');
  return cached('ia:item:' + id, 6 * 3600e3, async () => {
    const d = await getJSON(`https://archive.org/metadata/${encodeURIComponent(id)}`, 12000), m = d.metadata || {};
    const lic = LICENSE(m.licenseurl); if (!lic) throw bad('У этого альбома нет свободной лицензии');
    const a = album({ identifier: id, title: m.title, creator: m.creator, licenseurl: m.licenseurl, downloads: d.item?.downloads });
    const files = (d.files || []).filter((f) => /^(VBR MP3|MP3|128Kbps MP3|64Kbps MP3|Ogg Vorbis)$/i.test(f.format || ''));
    const pick = new Map(); for (const f of files) { const base = (f.original || f.name).replace(/\.[^.]+$/, ''); const prev = pick.get(base); if (!prev || /VBR MP3/i.test(f.format)) pick.set(base, f); }
    const tracks = [...pick.values()].sort((x, y) => (Number(x.track) || 0) - (Number(y.track) || 0) || String(x.name).localeCompare(String(y.name), 'ru', { numeric: true })).slice(0, 80).map((f) => ({
      key: `ia:${id}/${f.name}`, kind: 'archive', title: clip(f.title || f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), 100), artist: clip(f.creator || f.artist || a.artist, 90), album: a.title,
      cover: a.cover, src: `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`, duration: secs(f.length), license: lic, licenseUrl: a.licenseUrl, link: a.link }));
    return { ...a, about: clip(String(m.description || '').replace(/<[^>]+>/g, ' '), 400), tracks };
  });
}

// ── podcasts: Apple's public catalogue for discovery, the show's own RSS for episodes ──
const show = (o) => ({ id: String(o.id), title: clip(o.title, 100), artist: clip(o.artist, 90), cover: https(o.cover), link: https(o.link) });
const podcastsTop = () => cached('pod:top', 6 * 3600e3, async () => {
  const d = await getJSON('https://itunes.apple.com/ru/rss/toppodcasts/limit=30/json');
  return (d.feed?.entry || []).map((e) => show({ id: e.id?.attributes?.['im:id'], title: e['im:name']?.label, artist: e['im:artist']?.label, cover: (e['im:image'] || []).at(-1)?.label?.replace(/\/\d+x\d+bb\./, '/400x400bb.'), link: e.link?.attributes?.href })).filter((s) => s.id && s.id !== 'undefined');
});
const podcastsFind = (term) => cached('pod:q:' + term, 30 * 60e3, async () => {
  const d = await getJSON('https://itunes.apple.com/search?' + q({ media: 'podcast', term, country: 'RU', limit: 24 }));
  return (d.results || []).map((r) => show({ id: r.collectionId, title: r.collectionName, artist: r.artistName, cover: r.artworkUrl600 || r.artworkUrl100, link: r.collectionViewUrl }));
});
const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? unxml(m[1]) : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*${a}=["']([^"']+)["']`, 'i')); return m ? m[1].replace(/&amp;/g, '&') : ''; };
async function podcast(id) {
  if (!/^\d{1,15}$/.test(id)) throw bad('Нет такого подкаста');
  return cached('pod:' + id, 60 * 60e3, async () => {
    const r = (await getJSON('https://itunes.apple.com/lookup?id=' + id)).results?.[0]; if (!r?.feedUrl) throw bad('У подкаста нет открытой ленты');
    const s = show({ id, title: r.collectionName, artist: r.artistName, cover: r.artworkUrl600 || r.artworkUrl100, link: r.collectionViewUrl });
    const xml = await getText(r.feedUrl.replace(/^http:/, 'https:')), chan = xml.split(/<item[\s>]/i)[0];
    const episodes = xml.split(/<item[\s>]/i).slice(1, 61).map((it) => {
      const src = https(attr(it, 'enclosure', 'url')), title = tag(it, 'title');
      return src && title ? { key: `pod:${id}:${src.slice(-80)}`, kind: 'podcast', title: clip(title, 120), artist: s.title, album: s.title, cover: https(attr(it, 'itunes:image', 'href')) || s.cover, src, duration: secs(tag(it, 'itunes:duration')), date: Date.parse(tag(it, 'pubDate')) || 0, link: s.link } : null;
    }).filter(Boolean);
    return { ...s, about: clip(tag(chan, 'description') || tag(chan, 'itunes:summary'), 400), episodes };
  });
}

// ── your own music: ~/Music, read-only ──────────────────────────────────────
const MUSIC = path.join(os.homedir(), 'Music');
const AUDIO = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus)$/i;
const MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg' };
const idOf = (rel) => Buffer.from(rel).toString('base64url');
let realMusic = null;
function inside(rel) {                                                       // a path from an id → a real file inside ~/Music, or null
  try { realMusic ||= fs.realpathSync(MUSIC); const full = fs.realpathSync(path.join(MUSIC, rel)); return full.startsWith(realMusic + path.sep) && AUDIO.test(full) ? full : null; } catch { return null; }
}
function id3(full) {                                                         // title, artist, album and whether there is a cover — ID3v2 text frames only
  const out = {}; let fd;
  try {
    fd = fs.openSync(full, 'r'); const head = Buffer.alloc(10); fs.readSync(fd, head, 0, 10, 0);
    if (head.toString('latin1', 0, 3) !== 'ID3') return out;
    const ver = head[3], size = (head[6] & 127) << 21 | (head[7] & 127) << 14 | (head[8] & 127) << 7 | (head[9] & 127);
    const buf = Buffer.alloc(Math.min(size, 512 * 1024)); fs.readSync(fd, buf, 0, buf.length, 10);
    const dec = (b) => { const enc = b[0], body = b.subarray(1); try { if (enc === 1 || enc === 2) return new TextDecoder(enc === 1 ? 'utf-16' : 'utf-16be').decode(body).replace(/\0/g, '').trim(); if (enc === 3) return body.toString('utf8').replace(/\0/g, '').trim(); return body.toString('latin1').replace(/\0/g, '').trim(); } catch { return ''; } };
    for (let i = 0; i + 10 < buf.length;) {
      const fid = buf.toString('latin1', i, i + 4); if (!/^[A-Z0-9]{4}$/.test(fid)) break;
      const len = ver === 4 ? ((buf[i + 4] & 127) << 21 | (buf[i + 5] & 127) << 14 | (buf[i + 6] & 127) << 7 | (buf[i + 7] & 127)) : buf.readUInt32BE(i + 4);
      if (len <= 0 || i + 10 + len > buf.length) { if (fid === 'APIC') out.cover = true; break; }
      const body = buf.subarray(i + 10, i + 10 + len);
      if (fid === 'TIT2') out.title = dec(body); else if (fid === 'TPE1') out.artist = dec(body); else if (fid === 'TALB') out.album = dec(body); else if (fid === 'APIC') out.cover = true;
      i += 10 + len;
    }
  } catch { /* unreadable tag → names from the path */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return out;
}
function cover(full) {                                                       // the embedded picture of an MP3, if any
  let fd; try {
    fd = fs.openSync(full, 'r'); const head = Buffer.alloc(10); fs.readSync(fd, head, 0, 10, 0); if (head.toString('latin1', 0, 3) !== 'ID3') return null;
    const ver = head[3], size = (head[6] & 127) << 21 | (head[7] & 127) << 14 | (head[8] & 127) << 7 | (head[9] & 127);
    const buf = Buffer.alloc(Math.min(size, 8 * 1024 * 1024)); fs.readSync(fd, buf, 0, buf.length, 10);
    for (let i = 0; i + 10 < buf.length;) {
      const fid = buf.toString('latin1', i, i + 4); if (!/^[A-Z0-9]{4}$/.test(fid)) break;
      const len = ver === 4 ? ((buf[i + 4] & 127) << 21 | (buf[i + 5] & 127) << 14 | (buf[i + 6] & 127) << 7 | (buf[i + 7] & 127)) : buf.readUInt32BE(i + 4);
      if (fid === 'APIC') { const b = buf.subarray(i + 10, i + 10 + len), enc = b[0]; let p = b.indexOf(0, 1); const mime = b.toString('latin1', 1, p) || 'image/jpeg'; p += 2;
        if (enc === 1 || enc === 2) { while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2; p += 2; } else { while (p < b.length && b[p] !== 0) p++; p += 1; }
        return { mime: /png/i.test(mime) ? 'image/png' : 'image/jpeg', data: b.subarray(p) }; }
      if (len <= 0) break; i += 10 + len;
    }
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
  return null;
}
let library = { at: 0, items: [] };
function scan() {
  if (Date.now() - library.at < 60e3) return library.items;
  const items = [], walk = (dir, depth) => {
    if (depth > 7 || items.length >= 3000) return; let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) { if (e.name.startsWith('.')) continue; const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1); else if (e.isFile() && AUDIO.test(e.name)) {
        const rel = path.relative(MUSIC, full), parts = rel.split(path.sep), t = /\.mp3$/i.test(e.name) ? id3(full) : {};
        const folderArtist = parts.length >= 3 ? parts.at(-3) : '', folderAlbum = parts.length >= 2 ? parts.at(-2) : '';
        const id = idOf(rel); let st = null; try { st = fs.statSync(full); } catch { /* gone */ }
        items.push({ key: 'local:' + id, kind: 'local', id, title: clip(t.title || e.name.replace(AUDIO, '').replace(/^\d+\s*[-.]?\s*/, ''), 100), artist: clip(t.artist || (/unknown/i.test(folderArtist) ? '' : folderArtist), 90),
          album: clip(t.album || (/unknown|media/i.test(folderAlbum) ? '' : folderAlbum), 90), cover: t.cover ? `/api/music/cover/${id}` : '', src: `/api/music/file/${id}`, size: st?.size || 0, added: st?.mtimeMs || 0 }); } }
  };
  walk(MUSIC, 0); items.sort((a, b) => b.added - a.added);
  library = { at: Date.now(), items }; return items;
}
function sendFile(req, res, full) {
  const st = fs.statSync(full), type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (range) {
    let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]), end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
    start = Math.max(0, start); end = Math.min(st.size - 1, end);
    if (start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...base, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 }); return fs.createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'content-length': st.size }); fs.createReadStream(full).pipe(res);
}

// ── likes, history, playlists ───────────────────────────────────────────────
function cleanTrack(t) {
  if (!t || typeof t !== 'object') throw bad('Нет трека');
  const key = clip(t.key, 300); if (!/^(radio|ia|pod|local|up|cloud):/.test(key)) throw bad('Нет трека');
  const src = String(t.src || ''); if (!(/^https:\/\//.test(src) || /^\/api\/music\/file\/[\w-]+$/.test(src) || /^\/api\/music\/up\/[\w-]+$/.test(src) || /^\/api\/music\/cloud\/[\w-]+\/stream$/.test(src))) throw bad('Нет трека');
  const pick = { key, kind: clip(t.kind, 12), title: clip(t.title, 120), artist: clip(t.artist, 90), album: clip(t.album, 90), cover: /^(https:\/\/|\/api\/music\/cover\/|\/api\/music\/(up|cloud)\/[\w-]+\/cover)/.test(String(t.cover || '')) ? clip(t.cover, 400) : '',
    src: clip(src, 600), duration: Math.max(0, Math.min(1e6, Number(t.duration) || 0)), live: !!t.live, license: clip(t.license, 60), licenseUrl: https(t.licenseUrl), link: https(t.link) };
  if (/^(up|cloud):/.test(key)) { pick.id = clip(t.id, 40); pick.cloud = clip(t.cloud, 60); pick.place = ['mac', 'cloud', 'both'].includes(t.place) ? t.place : ''; }
  return pick;
}
const parsed = (rows) => rows.map((r) => { try { return JSON.parse(r.track); } catch { return null; } }).filter(Boolean);
const likes = (user) => parsed(all('SELECT track FROM music_likes WHERE user = ? ORDER BY created DESC LIMIT 500', user));
const recent = (user, n = 30) => parsed(all('SELECT track FROM music_recent WHERE user = ? ORDER BY played DESC LIMIT ?', user, n));
const playlists = (user) => all('SELECT p.id, p.title, p.created, (SELECT COUNT(*) FROM music_playlist_items i WHERE i.pl = p.id) AS n FROM music_playlists p WHERE p.user = ? ORDER BY p.id', user);
const ownList = (user, id) => one('SELECT * FROM music_playlists WHERE id = ? AND user = ?', Number(id), user);

const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { if (e.user) throw e; console.error('[music]', e.message); return fallback; } };

// ── VIT Music: the person's own tracks ──────────────────────────────────────
// Level one — «На этом Mac»: the track is an ordinary file in ~/Music/VIT Music («Музыка → VIT Music» in Finder) — the person's own
// file, named «Исполнитель — Название», seen by Finder and other players; the app keeps only a row and a small cover. Free, nothing leaves
// the computer, and the app itself stays small. (Tracks added before 13 Nov lived in DATA/music-uploads/<user>/ and move there on start.)
// Level two — «В облаке VITON13»: a private copy in viton13.com's storage (site-patch/music-cloud), so the track is on
// the internet and on every device with this VITON ID. Cloud is part of the subscription (whatever spends gigabytes is paid).
const UP_MAX = 50 * 1024 * 1024, COVER_MAX = 2 * 1024 * 1024;
const UP_ROOT = path.join(DATA, 'music-uploads');
const upDir = (user) => { const d = path.join(UP_ROOT, String(user.id).replace(/[^\w-]/g, '_')); fs.mkdirSync(d, { recursive: true }); return d; };   // covers only
const LIB = path.resolve(process.env.VIT_MUSIC_DIR || path.join(os.homedir(), 'Music', 'VIT Music'));
const libDir = () => { fs.mkdirSync(LIB, { recursive: true }); return LIB; };
/** Where a track's audio is: an absolute path inside the VIT Music folder, or (older rows) a name in the data folder. */
const fileOf = (user, r) => { if (path.isAbsolute(r.file)) { const f = path.resolve(r.file); return f.startsWith(LIB + path.sep) ? f : null; } return path.join(upDir(user), path.basename(r.file)); };
const safeName = (s) => String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
function freeName(base, ext) { const dir = libDir(); let name = `${base}.${ext}`; for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base} (${i}).${ext}`; return path.join(dir, name); }
/** A file the person removes goes to the Trash, not into nothing. */
// tracks added before the folder existed move into it once, under readable names
try { for (const r of all('SELECT * FROM music_uploads')) { if (path.isAbsolute(r.file)) continue;
  const from = path.join(UP_ROOT, String(r.user).replace(/[^\w-]/g, '_'), path.basename(r.file)); if (!fs.existsSync(from)) continue;
  const to = freeName(safeName(r.artist ? `${r.artist} — ${r.title}` : r.title) || r.id, r.file.split('.').pop());
  try { fs.renameSync(from, to); } catch { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); }
  run('UPDATE music_uploads SET file = ? WHERE id = ?', to, r.id); } } catch (e) { console.error('[music] moving tracks into ~/Music/VIT Music:', e.message); }
function toTrash(file) { try { const t = path.join(os.homedir(), '.Trash'); fs.mkdirSync(t, { recursive: true }); let to = path.join(t, path.basename(file)); if (fs.existsSync(to)) to = path.join(t, Date.now() + ' ' + path.basename(file)); fs.renameSync(file, to); } catch { fs.rmSync(file, { force: true }); } }
const upRow = (user, id) => (/^[\w-]{6,40}$/.test(String(id)) ? one('SELECT * FROM music_uploads WHERE id = ? AND user = ?', String(id), user.id) : null);
const AUDIO_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg' };
/** What the bytes really are — the extension does not count. */
function sniffAudio(b) {
  if (b.length < 12) return null;
  const s = (a, z) => b.toString('latin1', a, z);
  if (s(0, 3) === 'ID3') return 'mp3';
  if (s(0, 4) === 'fLaC') return 'flac';
  if (s(0, 4) === 'OggS') return 'ogg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return 'wav';
  if (s(4, 8) === 'ftyp' && /^(M4A |M4B |M4P |mp42|mp41|isom|iso2|dash)$/.test(s(8, 12))) return 'm4a';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac';                         // ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return 'mp3';  // an MPEG audio frame without a tag
  return null;
}
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Title, artist, album and cover from an MP4/M4A file's iTunes atoms (moov › udta › meta › ilst). */
function mp4tags(b) {
  const out = {};
  const boxes = (start, end, fn) => { for (let i = start; i + 8 <= end;) { let size = b.readUInt32BE(i); const type = b.toString('latin1', i + 4, i + 8); let head = 8;
    if (size === 1 && i + 16 <= end) { size = Number(b.readBigUInt64BE(i + 8)); head = 16; } else if (size === 0) size = end - i;
    if (size < head || i + size > end) break; fn(type, i + head, i + size); i += size; } };
  const data = (s, e, fn) => boxes(s, e, (t, a, z) => { if (t === 'data' && z - a > 8) fn(b.readUInt32BE(a) & 0xffffff, b.subarray(a + 8, z)); });
  try {
    boxes(0, b.length, (t, a, z) => { if (t !== 'moov') return; boxes(a, z, (t2, a2, z2) => { if (t2 !== 'udta') return; boxes(a2, z2, (t3, a3, z3) => { if (t3 !== 'meta') return;
      boxes(a3 + 4, z3, (t4, a4, z4) => { if (t4 !== 'ilst') return; boxes(a4, z4, (t5, a5, z5) => {
        const text = (v) => data(a5, z5, (kind, val) => { if (kind === 1) out[v] = val.toString('utf8').trim(); });
        if (t5 === '\xa9nam') text('title'); else if (t5 === '\xa9ART' || t5 === 'aART') { if (!out.artist) text('artist'); } else if (t5 === '\xa9alb') text('album');
        else if (t5 === 'covr') data(a5, z5, (kind, val) => { if (!out.cover && (kind === 13 || kind === 14)) out.cover = { ext: kind === 14 ? 'png' : 'jpg', data: Buffer.from(val) }; });
      }); }); }); }); });
  } catch { /* a broken atom → names from the file */ }
  return out;
}
const coverUrl = (r) => (r.cover ? `/api/music/up/${r.id}/cover?v=${encodeURIComponent(r.cover.split('.').slice(-2, -1)[0] || '1')}` : '');
const upTrack = (r) => ({ key: 'up:' + r.id, kind: 'upload', id: r.id, title: r.title, artist: r.artist || '', album: r.album || '', duration: r.duration || 0, cover: coverUrl(r),
  src: `/api/music/up/${r.id}`, size: r.size, name: r.name, type: r.type, added: r.created, cloud: r.cloud || '', place: r.cloud ? 'both' : 'mac' });
const cloudTrack = (t) => ({ key: 'cloud:' + t.id, kind: 'cloud', id: '', cloud: t.id, title: clip(t.title, 120) || 'Без названия', artist: clip(t.artist, 90), album: clip(t.album, 90), duration: Number(t.duration) || 0,
  cover: t.hasCover ? `/api/music/cloud/${t.id}/cover` : '', src: `/api/music/cloud/${t.id}/stream`, size: Number(t.size) || 0, name: clip(t.name, 160), type: t.type || '', added: Date.parse(t.createdAt) || 0, place: 'cloud' });
const uploads = (user) => all('SELECT * FROM music_uploads WHERE user = ? ORDER BY created DESC', user.id).map(upTrack);
async function readBody(req, limit, msg) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error(msg), { http: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
function saveCover(user, r, bytes, ext) {
  const dir = upDir(user), name = `${r.id}.cover.${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  if (r.cover) fs.rmSync(path.join(dir, path.basename(r.cover)), { force: true });
  run('UPDATE music_uploads SET cover = ? WHERE id = ?', name, r.id); return name;
}
function addLocal(user, bytes, ext, { name, title, artist, album, duration, cloud = null, coverBytes = null, coverExt = null }) {
  const id = crypto.randomBytes(9).toString('base64url'), tmp = path.join(libDir(), `.vit-${id}.${ext}`);
  fs.writeFileSync(tmp, bytes);
  let tags = {};
  if (ext === 'mp3') { tags = id3(tmp); const c = cover(tmp); if (c && !coverBytes) { coverBytes = c.data; coverExt = c.mime === 'image/png' ? 'png' : 'jpg'; } }
  else if (ext === 'm4a') { tags = mp4tags(bytes); if (tags.cover && !coverBytes) { coverBytes = tags.cover.data; coverExt = tags.cover.ext; } }
  const base = String(name || 'Трек').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^\d+\s*[-.]?\s*/, '').trim();
  const t0 = title || tags.title || base || 'Без названия', a0 = artist || tags.artist || '';
  const file = freeName(safeName(a0 ? `${a0} — ${t0}` : t0) || id, ext); fs.renameSync(tmp, file);
  run('INSERT INTO music_uploads (id, user, name, file, type, size, title, artist, album, duration, cover, cloud, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, user.id, clip(name || path.basename(file), 160), file, AUDIO_TYPES[ext], bytes.length, clip(t0, 120), clip(a0, 90), clip(album || tags.album || '', 90),
    Math.max(0, Math.min(1e5, Number(duration) || 0)), null, cloud, now());
  const r = one('SELECT * FROM music_uploads WHERE id = ?', id);
  if (coverBytes && coverBytes.length <= COVER_MAX && sniffImage(coverBytes)) saveCover(user, r, coverBytes, coverExt || sniffImage(coverBytes));
  return one('SELECT * FROM music_uploads WHERE id = ?', id);
}
function removeLocal(user, r) {
  const audio = fileOf(user, r); if (audio && fs.existsSync(audio)) (path.isAbsolute(r.file) ? toTrash(audio) : fs.rmSync(audio, { force: true }));
  if (r.cover) fs.rmSync(path.join(upDir(user), path.basename(r.cover)), { force: true });
  run('DELETE FROM music_uploads WHERE id = ?', r.id);
}

// the cloud goes through the site bridge (server/worlds/messages.mjs) with the person's viton13.com session
const CLOUD_CODES = {
  QUOTA_EXCEEDED: 'Место в облаке закончилось — 2 ГБ на человека. Удалите что-нибудь из облака.', CLOUD_FULL: 'Облако VITON13 сейчас заполнено. Трек остаётся на этом Mac.',
  DAILY_LIMIT: 'На сегодня лимит облака исчерпан. Завтра всё снова будет доступно.', TOO_MANY_REQUESTS: 'Слишком много загрузок подряд. Подождите немного.',
  FILE_TOO_LARGE: 'Файл больше 50 МБ.', UNSUPPORTED_TYPE: 'Облако принимает mp3, m4a, aac, flac, wav и ogg.', NOT_FOUND: 'Трек не найден в облаке.', UPLOAD_INCOMPLETE: 'Файл не дошёл до облака целиком. Попробуйте ещё раз.',
  MUSIC_CLOUD_NOT_CONFIGURED: 'Облако VIT Music на viton13.com ещё не настроено.',
};
const NO_CLOUD = 'Облако VIT Music появится после обновления viton13.com';
const okHost = (u) => { try { const x = new URL(u); return (x.protocol === 'https:' && /(^|\.)googleapis\.com$/i.test(x.hostname)) || x.origin === new URL(SITE).origin; } catch { return false; } };
async function cloud(user, method, p, body) {
  if (!can(user, 'music.cloud')) throw Object.assign(new Error('Облако VIT Music — с подпиской VIT. На этом Mac треки хранятся бесплатно.'), { http: 402, code: 'subscribe' });
  if (siteMode === 'none') throw Object.assign(new Error('Облако работает в окне приложения VITON13'), { http: 409, code: 'window' });
  const r = await siteCall(user, method, '/api/music-cloud' + p, body);
  if (r.status === 0) throw Object.assign(new Error('viton13.com сейчас не отвечает'), { http: 503, code: 'down' });
  if (r.status === 401) throw Object.assign(new Error('Войдите на viton13.com — кнопка «Войти» в Сообщениях'), { http: 401, code: 'signin' });
  if ((r.status === 404 || r.status === 405) && (!r.data || !r.data.code || (p === '' && r.data.code === 'NOT_FOUND'))) throw Object.assign(new Error(NO_CLOUD), { http: 501, code: 'no_cloud' });
  if (r.status >= 400 || !r.data?.ok) throw Object.assign(new Error(CLOUD_CODES[r.data?.code] || 'Облако не смогло выполнить запрос'), { http: r.status >= 400 ? r.status : 502, code: r.data?.code || 'site' });
  return r.data;
}
const cloudErr = (e, json) => json(e.http || 500, { ok: false, code: e.code || 'site', message: e.message });
async function cloudUpload(user, r) {
  const bytes = fs.readFileSync(fileOf(user, r));
  const d = await cloud(user, 'POST', '/uploads', { name: r.name, type: r.type, size: r.size, title: r.title, artist: r.artist, album: r.album, duration: r.duration });
  if (!d.track?.id || !okHost(d.uploadUrl)) throw Object.assign(new Error('Облако дало странный адрес загрузки'), { http: 502 });
  const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'content-type': r.type, 'content-length': String(bytes.length) }, body: bytes, signal: AbortSignal.timeout(300000) }).catch(() => null);
  if (!put || put.status >= 300) throw Object.assign(new Error(CLOUD_CODES.UPLOAD_INCOMPLETE), { http: 502 });
  let coverB64 = '', coverType = '';
  if (r.cover) { try { const c = fs.readFileSync(path.join(upDir(user), path.basename(r.cover))); if (c.length <= 300 * 1024) { coverB64 = c.toString('base64'); coverType = IMAGE_TYPES[sniffImage(c)] || ''; } } catch { /* no cover */ } }
  await cloud(user, 'POST', `/${d.track.id}/complete`, coverB64 && coverType ? { cover: coverB64, coverType } : {});
  run('UPDATE music_uploads SET cloud = ? WHERE id = ?', d.track.id, r.id);
  return d.track.id;
}
async function cloudBytes(user, cid) {
  const d = await cloud(user, 'GET', `/${cid}/url`);
  if (!okHost(d.url)) throw Object.assign(new Error('Облако дало странный адрес'), { http: 502 });
  const r = await fetch(d.url, { signal: AbortSignal.timeout(300000) }).catch(() => null);
  if (!r || !r.ok) throw Object.assign(new Error('Не получилось скачать трек из облака'), { http: 502 });
  const b = Buffer.from(await r.arrayBuffer()); if (b.length > UP_MAX) throw Object.assign(new Error('Файл больше 50 МБ'), { http: 413 });
  return { bytes: b, track: d.track || {} };
}
const coverCache = new Map();
function sendUpload(req, res, full, r, download) {
  if (!download) return sendFile(req, res, full);
  const st = fs.statSync(full), name = r.name || `${r.title}.${r.file.split('.').pop()}`;
  res.writeHead(200, { 'content-type': r.type || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}` });
  fs.createReadStream(full).pipe(res);
}

export async function handle({ req, res, url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'music') return false;
  const p = seg.slice(2), sp = url.searchParams;

  if (p[0] === 'file' && p[1] && method === 'GET') { let rel = ''; try { rel = Buffer.from(p[1], 'base64url').toString('utf8'); } catch { /* bad id */ }
    const full = rel && inside(rel); if (!full) { res.writeHead(404); res.end(); return true; } sendFile(req, res, full); return true; }
  if (p[0] === 'cover' && p[1] && method === 'GET') { let rel = ''; try { rel = Buffer.from(p[1], 'base64url').toString('utf8'); } catch { /* bad id */ }
    const full = rel && inside(rel), c = full && cover(full); if (!c) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { 'content-type': c.mime, 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' }); res.end(c.data); return true; }

  if (p[0] === 'home' && method === 'GET') {
    const [ru, top, free, pods] = await Promise.all([safe(radioRu, []), safe(radioTop, []), safe(archiveTop, []), safe(podcastsTop, [])]);
    json(200, { ok: true, ru, top, free, pods, tags: TAGS, likes: likes(user.id).slice(0, 50), recent: recent(user.id, 20), playlists: playlists(user.id), localCount: scan().length, upCount: one('SELECT COUNT(*) AS n FROM music_uploads WHERE user = ?', user.id).n }); return true;
  }
  if (p[0] === 'radio' && method === 'GET') {
    const tag = clip(sp.get('tag'), 40), text = clip(sp.get('q'), 60), country = sp.get('country');
    const items = text ? await safe(() => radioFind(text), []) : tag ? await safe(() => radioTag(tag), []) : country === 'RU' ? await safe(radioRu, []) : await safe(radioTop, []);
    json(200, { ok: true, items, tags: TAGS }); return true;
  }
  if (p[0] === 'archive' && method === 'GET') {
    if (p[1]) { json(200, { ok: true, album: await archiveItem(p[1]) }); return true; }
    const text = clip(sp.get('q'), 60); json(200, { ok: true, items: text ? await safe(() => archiveFind(text), []) : await safe(archiveTop, []) }); return true;
  }
  if (p[0] === 'podcasts' && method === 'GET') {
    if (p[1]) { json(200, { ok: true, show: await podcast(p[1]) }); return true; }
    const text = clip(sp.get('q'), 60); json(200, { ok: true, items: text ? await safe(() => podcastsFind(text), []) : await safe(podcastsTop, []) }); return true;
  }
  if (p[0] === 'library' && method === 'GET') {
    const text = clip(sp.get('q'), 60).toLowerCase(), items = scan();
    json(200, { ok: true, items: text ? items.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(text)) : items, folder: '~/Music' }); return true;
  }
  if (p[0] === 'search' && method === 'GET') {
    const text = clip(sp.get('q'), 60); if (!text) { json(200, { ok: true, radio: [], free: [], pods: [], local: [] }); return true; }
    const low = text.toLowerCase();
    const [r, f, pd] = await Promise.all([safe(() => radioFind(text), []), safe(() => archiveFind(text), []), safe(() => podcastsFind(text), [])]);
    json(200, { ok: true, radio: r.slice(0, 12), free: f.slice(0, 12), pods: pd.slice(0, 12), local: [...uploads(user).filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(low)), ...scan().filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(low))].slice(0, 30) }); return true;
  }

  // ── VIT Music: own tracks on this Mac ──
  if (p[0] === 'up') {
    if (method === 'POST' && p[1] === 'reveal') {                                  // «Показать в Finder»: the folder, or one track in it
      if (user.plan === 'guest') { fail(402, 'Своя музыка — с VITON ID'); return true; }
      const b = await body(), r = b.id ? upRow(user, b.id) : null, f = r ? fileOf(user, r) : libDir();
      const { execFile } = await import('node:child_process'); execFile('open', r && f ? ['-R', f] : [libDir()], () => {});
      json(200, { ok: true, folder: LIB }); return true; }
    if (method === 'GET' && p[1] && !p[2]) { const r = upRow(user, p[1]); const full = r && fileOf(user, r); if (!r || !full || !fs.existsSync(full)) { res.writeHead(404); res.end(); return true; } sendUpload(req, res, full, r, sp.get('download') === '1'); return true; }
    if (method === 'GET' && p[1] && p[2] === 'cover') { const r = upRow(user, p[1]); const full = r?.cover && path.join(upDir(user), path.basename(r.cover));
      if (!full || !fs.existsSync(full)) { res.writeHead(404); res.end(); return true; }
      res.writeHead(200, { 'content-type': IMAGE_TYPES[full.split('.').pop()] || 'image/jpeg', 'cache-control': 'max-age=86400', 'x-content-type-options': 'nosniff' }); fs.createReadStream(full).pipe(res); return true; }
    if (method === 'GET') { json(200, { ok: true, items: uploads(user), cloudAllowed: can(user, 'music.cloud'), canUpload: user.plan !== 'guest' }); return true; }
    if (user.plan === 'guest') { json(402, { ok: false, code: 'subscribe', message: 'Загружать свою музыку можно с VITON ID' }); return true; }
    if (method === 'POST' && !p[1]) {
      const bytes = await readBody(req, UP_MAX, 'Файл больше 50 МБ'), ext = sniffAudio(bytes);
      if (!ext) { fail(415, 'Это не аудиофайл. Подходят mp3, m4a, aac, flac, wav и ogg'); return true; }
      let name = ''; try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { /* keep empty */ }
      const r = addLocal(user, bytes, ext, { name: path.basename(name).slice(0, 160), duration: req.headers['x-duration'] });
      json(200, { ok: true, track: upTrack(r) }); return true;
    }
    const r = p[1] && upRow(user, p[1]); if (!r) { fail(404, 'Трек не найден'); return true; }
    if (method === 'POST' && p[2] === 'cover') {
      const bytes = await readBody(req, COVER_MAX, 'Обложка больше 2 МБ'), ext = sniffImage(bytes); if (!ext) { fail(415, 'Обложка — jpg, png или webp'); return true; }
      saveCover(user, r, bytes, ext); json(200, { ok: true, track: upTrack(one('SELECT * FROM music_uploads WHERE id = ?', r.id)) }); return true;
    }
    if (method === 'POST' && p[2] === 'cloud') { try { await cloudUpload(user, r); json(200, { ok: true, track: upTrack(one('SELECT * FROM music_uploads WHERE id = ?', r.id)) }); } catch (e) { cloudErr(e, json); } return true; }
    if (method === 'POST' && !p[2]) {
      const b = await body(), title = clip(b.title, 120), artist = clip(b.artist, 90), album = clip(b.album, 90);
      if (!title) { fail(400, 'Назовите трек'); return true; }
      run('UPDATE music_uploads SET title = ?, artist = ?, album = ? WHERE id = ?', title, artist, album, r.id);
      if (typeof b.duration === 'number' && b.duration > 0 && !r.duration) run('UPDATE music_uploads SET duration = ? WHERE id = ?', Math.min(1e5, b.duration), r.id);
      if (r.cloud && can(user, 'music.cloud')) cloud(user, 'PATCH', `/${r.cloud}`, { title, artist, album }).catch(() => {});            // the cloud copy follows, quietly
      json(200, { ok: true, track: upTrack(one('SELECT * FROM music_uploads WHERE id = ?', r.id)) }); return true;
    }
    if (method === 'DELETE') { removeLocal(user, r); run("DELETE FROM music_likes WHERE user = ? AND key = ?", user.id, 'up:' + r.id); json(200, { ok: true }); return true; }
  }
  // ── VIT Music: the cloud copy on viton13.com ──
  if (p[0] === 'cloud') {
    const cid = p[1] && /^[\w-]{6,64}$/.test(p[1]) ? p[1] : null;
    try {
      if (!p[1] && method === 'GET') {
        const d = await cloud(user, 'GET', ''), mine = new Set(all('SELECT cloud FROM music_uploads WHERE user = ? AND cloud IS NOT NULL', user.id).map((x) => x.cloud));
        const tracks = Array.isArray(d.tracks) ? d.tracks : [];
        // a local copy whose cloud twin is gone becomes «only on this Mac» again
        const live = new Set(tracks.map((t) => t.id)); for (const c of mine) if (!live.has(c)) run('UPDATE music_uploads SET cloud = NULL WHERE user = ? AND cloud = ?', user.id, c);
        json(200, { ok: true, state: 'ready', used: Number(d.usedBytes) || 0, quota: Number(d.quotaBytes) || 0, items: tracks.filter((t) => !mine.has(t.id)).map(cloudTrack), all: tracks.length }); return true;
      }
      if (!cid) { fail(404, 'Трек не найден'); return true; }
      if (p[2] === 'stream' && method === 'GET') { const d = await cloud(user, 'GET', `/${cid}/url`); if (!okHost(d.url)) { res.writeHead(502); res.end(); return true; } res.writeHead(302, { location: d.url, 'cache-control': 'no-store' }); res.end(); return true; }
      if (p[2] === 'cover' && method === 'GET') {
        let c = coverCache.get(user.id + cid);
        if (!c) { const d = await cloud(user, 'GET', `/${cid}/cover`); const b = Buffer.from(String(d.data || ''), 'base64'), ext = sniffImage(b); if (!ext) { res.writeHead(404); res.end(); return true; } c = { b, type: IMAGE_TYPES[ext] }; coverCache.set(user.id + cid, c); if (coverCache.size > 300) coverCache.delete(coverCache.keys().next().value); }
        res.writeHead(200, { 'content-type': c.type, 'cache-control': 'max-age=3600', 'x-content-type-options': 'nosniff' }); res.end(c.b); return true;
      }
      if (p[2] === 'download' && method === 'POST') {
        if (user.plan === 'guest') { json(402, { ok: false, code: 'subscribe', message: 'С VITON ID' }); return true; }
        const have = one('SELECT * FROM music_uploads WHERE user = ? AND cloud = ?', user.id, cid); if (have) { json(200, { ok: true, track: upTrack(have) }); return true; }
        const { bytes, track } = await cloudBytes(user, cid), ext = sniffAudio(bytes); if (!ext) { fail(415, 'В облаке лежит не аудиофайл'); return true; }
        let coverBytes = null; if (track.hasCover) { try { const d = await cloud(user, 'GET', `/${cid}/cover`); coverBytes = Buffer.from(String(d.data || ''), 'base64'); } catch { /* without a cover */ } }
        const r = addLocal(user, bytes, ext, { name: track.name, title: track.title, artist: track.artist, album: track.album, duration: track.duration, cloud: cid, coverBytes, coverExt: coverBytes ? sniffImage(coverBytes) : null });
        json(200, { ok: true, track: upTrack(r) }); return true;
      }
      if (!p[2] && method === 'POST') { const b = await body(); await cloud(user, 'PATCH', `/${cid}`, { title: clip(b.title, 120), artist: clip(b.artist, 90), album: clip(b.album, 90) }); coverCache.delete(user.id + cid); json(200, { ok: true }); return true; }
      if (!p[2] && method === 'DELETE') { await cloud(user, 'DELETE', `/${cid}`); run('UPDATE music_uploads SET cloud = NULL WHERE user = ? AND cloud = ?', user.id, cid); run('DELETE FROM music_likes WHERE user = ? AND key = ?', user.id, 'cloud:' + cid); json(200, { ok: true }); return true; }
    } catch (e) { if (e.http) { cloudErr(e, json); return true; } throw e; }
    fail(404, 'Нет такого адреса'); return true;
  }

  if (p[0] === 'likes') {
    if (method === 'GET') { json(200, { ok: true, items: likes(user.id) }); return true; }
    if (method === 'POST') { const t = cleanTrack((await body()).track); run('INSERT INTO music_likes (user, key, track, created) VALUES (?, ?, ?, ?) ON CONFLICT (user, key) DO UPDATE SET track = excluded.track', user.id, t.key, JSON.stringify(t), now()); json(200, { ok: true }); return true; }
    if (method === 'DELETE') { const key = clip(sp.get('key'), 300); run('DELETE FROM music_likes WHERE user = ? AND key = ?', user.id, key); json(200, { ok: true }); return true; }
  }
  if (p[0] === 'recent' && method === 'POST') {
    const t = cleanTrack((await body()).track);
    run('INSERT INTO music_recent (user, key, track, played) VALUES (?, ?, ?, ?) ON CONFLICT (user, key) DO UPDATE SET track = excluded.track, played = excluded.played', user.id, t.key, JSON.stringify(t), now());
    run('DELETE FROM music_recent WHERE user = ? AND key NOT IN (SELECT key FROM music_recent WHERE user = ? ORDER BY played DESC LIMIT 100)', user.id, user.id);
    json(200, { ok: true }); return true;
  }
  if (p[0] === 'playlists') {
    if (!p[1] && method === 'GET') { json(200, { ok: true, items: playlists(user.id) }); return true; }
    if (!p[1] && method === 'POST') { const title = clip((await body()).title, 60); if (!title) return fail(400, 'Назовите плейлист'), true;
      const id = Number(run('INSERT INTO music_playlists (user, title, created) VALUES (?, ?, ?)', user.id, title, now()).lastInsertRowid); json(200, { ok: true, id, items: playlists(user.id) }); return true; }
    const pl = p[1] && ownList(user.id, p[1]); if (!pl) return fail(404, 'Плейлист не найден'), true;
    if (method === 'GET') { json(200, { ok: true, playlist: { ...pl, tracks: parsed(all('SELECT track FROM music_playlist_items WHERE pl = ? ORDER BY pos', pl.id)) } }); return true; }
    if (method === 'POST') { const b = await body();
      if (typeof b.title === 'string' && b.title.trim()) run('UPDATE music_playlists SET title = ? WHERE id = ?', clip(b.title, 60), pl.id);
      if (b.track) { const t = cleanTrack(b.track), pos = (one('SELECT MAX(pos) AS m FROM music_playlist_items WHERE pl = ?', pl.id)?.m ?? -1) + 1; run('INSERT OR IGNORE INTO music_playlist_items (pl, key, track, pos) VALUES (?, ?, ?, ?)', pl.id, t.key, JSON.stringify(t), pos); }
      if (typeof b.remove === 'string') run('DELETE FROM music_playlist_items WHERE pl = ? AND key = ?', pl.id, b.remove);
      json(200, { ok: true, items: playlists(user.id) }); return true; }
    if (method === 'DELETE') { run('DELETE FROM music_playlist_items WHERE pl = ?', pl.id); run('DELETE FROM music_playlists WHERE id = ?', pl.id); json(200, { ok: true, items: playlists(user.id) }); return true; }
  }
  return fail(404, 'Нет такого адреса'), true;
}
