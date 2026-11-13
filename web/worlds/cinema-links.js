// What a pasted link to a film or a series is — one field, recognised by itself. Pure: no DOM, so node can test it.
//   YouTube (watch, youtu.be, shorts, live, embed, a playlist with its index)  → kind «youtube», a canonical watch/playlist URL
//   a video file (.mp4 .m4v .webm .mov .ogv .mkv; .m3u8 only where the engine plays HLS itself) → kind «video»
//   a player site: Rutube, VK Video, Vimeo, Dailymotion, OK — the official embed page where there is one; any other site as is → kind «site»
// Everything becomes https; links to this computer or a home network are refused (the app's server checks again).
export const SERVICES = { youtube: 'YouTube', rutube: 'Rutube', vk: 'VK Видео', vimeo: 'Vimeo', dailymotion: 'Dailymotion', ok: 'OK' };
const FILE = /\.(mp4|m4v|webm|mov|ogv|mkv)$/i, HLS = /\.m3u8$/i, OTHER = /\.(avi|wmv|flv|mpd|ts|3gp|mpg|mpeg|rm|rmvb|vob)$/i;
const YT_ID = /^[A-Za-z0-9_-]{11}$/, YT_LIST = /^[A-Za-z0-9_-]{10,64}$/;
const UNSUPPORTED = 'Этот формат пока не поддерживается — подойдёт .mp4 или .webm, YouTube или сайт с плеером';
const fail = (message) => ({ error: true, message });

function localHost(host) {
  const x = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (x === 'localhost' || x.endsWith('.localhost') || x.endsWith('.local') || x.endsWith('.internal') || !x.includes('.') && !x.includes(':')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(x);
  if (v4) { const a = +v4[1], b = +v4[2]; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  return x === '::1' || x === '::' || /^(fc|fd|fe80)/.test(x) || x.startsWith('::ffff:');
}

function youtube(u, host) {
  const p = u.pathname, q = u.searchParams;
  let id = host === 'youtu.be' ? p.split('/')[1] : q.get('v') || (/^\/(?:shorts|live|embed|v|e)\/([^/?#]+)/.exec(p) || [])[1];
  if (id === 'videoseries') id = '';
  const list = YT_LIST.test(q.get('list') || '') ? q.get('list') : '', index = Math.max(0, Math.min(5000, parseInt(q.get('index') || '', 10) || 0));
  if (id && !YT_ID.test(id)) id = '';
  if (!id && !list) return fail('Это страница YouTube, а не видео — откройте само видео или плейлист и скопируйте ссылку');
  const out = new URL(id ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/playlist');
  if (id) out.searchParams.set('v', id);
  if (list) { out.searchParams.set('list', list); if (index) out.searchParams.set('index', String(index)); }
  return { kind: 'youtube', src: out.href, service: 'youtube', name: SERVICES.youtube, embed: true };
}

function site(u, host) {
  const p = u.pathname, q = u.searchParams, page = { kind: 'site', src: u.href, embed: false };
  if (host === 'rutube.ru') {
    const id = (/^\/(?:video(?:\/private)?|play\/embed|shorts)\/([0-9a-f]{32})/i.exec(p) || [])[1];
    const key = /^[\w-]{4,80}$/.test(q.get('p') || '') ? q.get('p') : '';
    return { ...page, service: 'rutube', name: SERVICES.rutube, ...(id ? { src: `https://rutube.ru/play/embed/${id.toLowerCase()}${key ? '?p=' + key : ''}`, embed: true } : {}) };
  }
  if (/^(vk\.com|vk\.ru|vkvideo\.ru)$/.test(host)) {
    let oid = q.get('oid'), vid = q.get('id');
    if (!(oid && vid)) { const m = /video(-?\d+)_(\d+)/.exec(p + ' ' + (q.get('z') || '')); if (m) { oid = m[1]; vid = m[2]; } }
    const hash = /^[0-9a-f]{6,40}$/i.test(q.get('hash') || '') ? q.get('hash') : '';
    const ok = /^-?\d{1,20}$/.test(oid || '') && /^\d{1,20}$/.test(vid || '');
    return { ...page, service: 'vk', name: SERVICES.vk, ...(ok && hash ? { src: `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hash=${hash}`, embed: true } : {}) };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = p.split('/').filter(Boolean), at = parts.findIndex((s) => /^\d{5,12}$/.test(s)), id = at >= 0 ? parts[at] : '';
    const h = /^[0-9a-f]{6,20}$/i.test(q.get('h') || '') ? q.get('h') : /^[0-9a-f]{6,20}$/i.test(parts[at + 1] || '') ? parts[at + 1] : '';
    return { ...page, service: 'vimeo', name: SERVICES.vimeo, ...(id ? { src: `https://player.vimeo.com/video/${id}${h ? '?h=' + h : ''}`, embed: true } : {}) };
  }
  if (host === 'dailymotion.com' || host === 'dai.ly' || host === 'geo.dailymotion.com') {
    const raw = host === 'dai.ly' ? p.split('/')[1] : q.get('video') || (/\/(?:embed\/)?video\/([^/?#]+)/.exec(p) || [])[1];
    const id = /^x[0-9a-z]{3,12}/i.exec(String(raw || '').split('_')[0])?.[0] || '';
    return { ...page, service: 'dailymotion', name: SERVICES.dailymotion, ...(id ? { src: `https://www.dailymotion.com/embed/video/${id}`, embed: true } : {}) };
  }
  if (host === 'ok.ru' || host === 'odnoklassniki.ru') {
    const id = (/^\/(?:video|live|videoembed)\/(\d{3,20})/.exec(p) || [])[1];
    return { ...page, service: 'ok', name: SERVICES.ok, ...(id ? { src: `https://ok.ru/videoembed/${id}`, embed: true } : {}) };
  }
  return { ...page, service: 'web', name: u.hostname.replace(/^www\./, '') };
}

/** Pasted text → { kind, src, service, name, embed } or { error, message }. `hls: true` when the engine plays .m3u8 itself. */
export function parseFilmLink(text, { hls = false } = {}) {
  let t = String(text || '').trim();
  if (!t) return fail('Вставьте ссылку на фильм или серию');
  if (/\s/.test(t)) return fail('В ссылке не должно быть пробелов');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) { if (/^(\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(t)) t = 'https://' + t.replace(/^\/\//, ''); else return fail('Это не похоже на ссылку'); }
  let u; try { u = new URL(t); } catch { return fail('Это не похоже на ссылку'); }
  if (u.protocol === 'http:') u = new URL('https:' + u.href.slice(5));
  if (u.protocol !== 'https:') return fail('Нужна ссылка вида https://…');
  if (u.username || u.password) return fail('Ссылка с логином и паролем не подходит');
  if (localHost(u.hostname)) return fail('Ссылки на этот компьютер и домашнюю сеть не подходят');
  if (u.href.length > 600) return fail('Ссылка слишком длинная');
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (/^(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) return youtube(u, host);
  const path = decodeURIComponent(u.pathname);
  if (FILE.test(path)) return { kind: 'video', src: u.href, service: 'file', name: path.split('/').pop(), embed: false };
  if (HLS.test(path)) return hls ? { kind: 'video', src: u.href, service: 'hls', name: path.split('/').pop(), embed: false, hls: true } : fail(UNSUPPORTED);
  if (OTHER.test(path)) return fail(UNSUPPORTED);
  return site(u, host);
}

/** A file from the Mac: only its name goes into the screening. */
export const fileName = (name) => String(name || '').split(/[/\\]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
