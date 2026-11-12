// Music world: internet radio (Radio Browser, an open community catalogue), free music from the Internet Archive
// (Creative Commons and public domain only, with the licence on every track), podcasts (Apple's public catalogue + the
// shows' own RSS), and the person's own files from ~/Music. Only metadata passes through here; streams play from their
// own addresses, except local files, which this route serves with Range so seeking works.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, all, one, run, now } from '../db.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS music_likes (user TEXT, key TEXT, track TEXT, created INTEGER, PRIMARY KEY (user, key));
CREATE TABLE IF NOT EXISTS music_recent (user TEXT, key TEXT, track TEXT, played INTEGER, PRIMARY KEY (user, key));
CREATE TABLE IF NOT EXISTS music_playlists (id INTEGER PRIMARY KEY, user TEXT, title TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS music_playlist_items (pl INTEGER, key TEXT, track TEXT, pos INTEGER, PRIMARY KEY (pl, key));`);

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
  const key = clip(t.key, 300); if (!/^(radio|ia|pod|local):/.test(key)) throw bad('Нет трека');
  const src = String(t.src || ''); if (!(/^https:\/\//.test(src) || /^\/api\/music\/file\/[\w-]+$/.test(src))) throw bad('Нет трека');
  const pick = { key, kind: clip(t.kind, 12), title: clip(t.title, 120), artist: clip(t.artist, 90), album: clip(t.album, 90), cover: /^(https:\/\/|\/api\/music\/cover\/)/.test(String(t.cover || '')) ? clip(t.cover, 400) : '',
    src: clip(src, 600), duration: Math.max(0, Math.min(1e6, Number(t.duration) || 0)), live: !!t.live, license: clip(t.license, 60), licenseUrl: https(t.licenseUrl), link: https(t.link) };
  return pick;
}
const parsed = (rows) => rows.map((r) => { try { return JSON.parse(r.track); } catch { return null; } }).filter(Boolean);
const likes = (user) => parsed(all('SELECT track FROM music_likes WHERE user = ? ORDER BY created DESC LIMIT 500', user));
const recent = (user, n = 30) => parsed(all('SELECT track FROM music_recent WHERE user = ? ORDER BY played DESC LIMIT ?', user, n));
const playlists = (user) => all('SELECT p.id, p.title, p.created, (SELECT COUNT(*) FROM music_playlist_items i WHERE i.pl = p.id) AS n FROM music_playlists p WHERE p.user = ? ORDER BY p.id', user);
const ownList = (user, id) => one('SELECT * FROM music_playlists WHERE id = ? AND user = ?', Number(id), user);

const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { if (e.user) throw e; console.error('[music]', e.message); return fallback; } };

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
    json(200, { ok: true, ru, top, free, pods, tags: TAGS, likes: likes(user.id).slice(0, 50), recent: recent(user.id, 20), playlists: playlists(user.id), localCount: scan().length }); return true;
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
    json(200, { ok: true, radio: r.slice(0, 12), free: f.slice(0, 12), pods: pd.slice(0, 12), local: scan().filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(low)).slice(0, 30) }); return true;
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
