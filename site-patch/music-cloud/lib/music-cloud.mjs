// VIT Music cloud: a private copy of a person's own tracks in the project's Storage bucket.
// Pure rules and limits — the routes in app/api/music-cloud/** use them, and so does the app's test stand-in.
// Nothing here is ever public: files are read only through short-lived signed URLs issued to their owner.

export const USERS = "vitonMusicCloud";                 // vitonMusicCloud/{uid} — usage; …/tracks/{trackId} — one track
export const TOTALS = "vitonMusicCloudTotals";          // vitonMusicCloudTotals/project — the whole project's usage

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const GB = 1024 * 1024 * 1024, MB = 1024 * 1024;
/** Limits. The defaults keep the first month inside the no-cost Storage tier (see README); each can be raised by env. */
export const LIMITS = {
  trackBytes: 50 * MB,
  userQuotaBytes: num(process.env.MUSIC_CLOUD_USER_QUOTA_BYTES, 2 * GB),
  projectCapBytes: num(process.env.MUSIC_CLOUD_PROJECT_CAP_BYTES, 4.5 * GB),
  projectDailyDownloadBytes: num(process.env.MUSIC_CLOUD_DAILY_DOWNLOAD_BYTES, 900 * MB),
  userDailyDownloadBytes: num(process.env.MUSIC_CLOUD_USER_DAILY_DOWNLOAD_BYTES, 300 * MB),
  uploadsPerDay: num(process.env.MUSIC_CLOUD_UPLOADS_PER_DAY, 60),
  coverBytes: 300 * 1024,
  pendingTtlMs: 2 * 60 * 60 * 1000,
  signedUrlMs: 15 * 60 * 1000,
};

export const AUDIO_TYPES = {
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac", "audio/wav": "wav", "audio/ogg": "ogg",
};
export const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const TRACK_ID = /^[A-Za-z0-9]{20}$/;

const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

/** The metadata of a new upload, or an error code. */
export function normalizeUpload(p) {
  const type = String(p?.type || "").toLowerCase().split(";")[0].trim();
  if (!AUDIO_TYPES[type]) return { error: "UNSUPPORTED_TYPE" };
  const size = Math.floor(Number(p?.size));
  if (!Number.isSafeInteger(size) || size <= 0) return { error: "INVALID_FILE_SIZE" };
  if (size > LIMITS.trackBytes) return { error: "FILE_TOO_LARGE" };
  const name = clip(p?.name, 160) || `track.${AUDIO_TYPES[type]}`;
  return {
    value: {
      type, size, name,
      title: clip(p?.title, 120) || name.replace(/\.[a-z0-9]{2,5}$/i, ""),
      artist: clip(p?.artist, 90), album: clip(p?.album, 90),
      duration: Math.max(0, Math.min(100000, Number(p?.duration) || 0)),
    },
  };
}
export function normalizeEdit(p) {
  const out = {};
  if (typeof p?.title === "string") { const t = clip(p.title, 120); if (!t) return { error: "INVALID_TITLE" }; out.title = t; }
  if (typeof p?.artist === "string") out.artist = clip(p.artist, 90);
  if (typeof p?.album === "string") out.album = clip(p.album, 90);
  return { value: out };
}
/** A cover that came with «complete»: base64 of a small jpg/png/webp, checked by its first bytes. */
export function normalizeCover(data, type) {
  if (!data) return { value: null };
  if (!COVER_TYPES.has(String(type))) return { error: "INVALID_COVER" };
  if (typeof data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(data)) return { error: "INVALID_COVER" };
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > LIMITS.coverBytes) return { error: "INVALID_COVER" };
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8, png = bytes.toString("latin1", 1, 4) === "PNG", webp = bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
  if (!(jpg || png || webp)) return { error: "INVALID_COVER" };
  return { value: { data: bytes.toString("base64"), type } };
}

export const objectPath = (uid, trackId, type) => `music-cloud/${uid}/${trackId}.${AUDIO_TYPES[type] || "bin"}`;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

/** What the owner sees about a track. Never the storage path, never a URL. */
export function toPublicTrack(id, t) {
  return {
    id, name: t.name || "", type: t.type || "", size: Number(t.size) || 0,
    title: t.title || "", artist: t.artist || "", album: t.album || "", duration: Number(t.duration) || 0,
    hasCover: Boolean(t.cover), createdAt: t.createdAt || "",
  };
}

/** Will this upload fit? Returns an error code or null. Usage numbers are plain counters kept in transactions. */
export function checkRoom({ user = {}, totals = {}, size }) {
  const mine = (Number(user.usedBytes) || 0) + (Number(user.pendingBytes) || 0);
  if (mine + size > LIMITS.userQuotaBytes) return "QUOTA_EXCEEDED";
  const all = (Number(totals.storedBytes) || 0) + (Number(totals.pendingBytes) || 0);
  if (all + size > LIMITS.projectCapBytes) return "CLOUD_FULL";
  return null;
}
/** May this person fetch one more track today? Returns the updated counters or an error code. */
export function checkDownload({ user = {}, totals = {}, size, now = new Date() }) {
  const day = today(now);
  const userDay = user.day === day ? Number(user.dayDownloadBytes) || 0 : 0;
  const projectDay = totals.day === day ? Number(totals.dayDownloadBytes) || 0 : 0;
  if (userDay + size > LIMITS.userDailyDownloadBytes || projectDay + size > LIMITS.projectDailyDownloadBytes) return { error: "DAILY_LIMIT" };
  return { value: { user: { day, dayDownloadBytes: userDay + size }, totals: { day, dayDownloadBytes: projectDay + size } } };
}
