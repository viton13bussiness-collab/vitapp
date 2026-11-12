// Shared shapes for VITON ID direct messages.
//
// The server never sees plaintext: a message travels as an AES-GCM ciphertext
// plus IV, produced in the browser (lib/dm-crypto.js). Everything here is the
// envelope — participant pairing, size caps, and the public slice of a profile
// that search and profile views are allowed to expose.

import { createHash } from "node:crypto";

/** Ciphertext cap. ~2000 chars of UTF-8 plaintext lands well under this. */
export const DM_MAX_CIPHERTEXT_LENGTH = 12_000;
export const DM_MAX_IV_LENGTH = 32;
export const DM_PAGE_SIZE = 40;
export const DM_MAX_SEARCH_RESULTS = 12;

/** Attachments: photos and documents, encrypted at rest like message text. */
export const DM_MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const DM_MAX_ATTACHMENT_BYTES = 4_000_000;
export const DM_ATTACHMENT_CHUNK_BYTES = 700_000;
export const DM_ATTACHMENT_TTL_MS = 6 * 60 * 60 * 1000;

/** Types a private thread accepts. Images render inline, voice notes play in
 *  place, and everything else is only ever handed back as a download. */
export const DM_ATTACHMENT_TYPES = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["image/gif", "image"],
  ["image/avif", "image"],
  ["audio/webm", "voice"],
  ["audio/ogg", "voice"],
  ["audio/mp4", "voice"],
  ["audio/mpeg", "voice"],
  // Video notes («кружки»): short round clips recorded in the VITON13 app.
  ["video/webm", "video"],
  ["video/mp4", "video"],
  ["application/pdf", "file"],
  ["text/plain", "file"],
]);

/** Video notes: one minute at most, and a daily cap per member that keeps the
 *  Firestore free tier safe (a minute is about 2 MB, a typical note 0.5–1 MB). */
export const DM_MAX_VIDEO_SECONDS = 60;
export const DM_MAX_VIDEO_NOTES_PER_DAY = 40;

/** Voice notes: long enough for a real thought, short enough to listen to. */
export const DM_MAX_VOICE_SECONDS = 180;
/** Bars drawn in the waveform, sampled while recording. */
export const DM_VOICE_PEAKS = 48;

/** A member counts as online while their last heartbeat is this fresh. */
export const DM_PRESENCE_ONLINE_MS = 75_000;
/** A typing flag decays on its own, so a closed tab never types forever. */
export const DM_TYPING_TTL_MS = 8_000;
export const DM_MAX_PRESENCE_IDS = 24;
/** Ids of removed messages kept on the thread so open clients can prune. */
export const DM_MAX_REMOVED_IDS = 300;

/** P-256 public JWK: two 43-char base64url coordinates. */
export function isValidPublicJwk(value) {
  if (!value || typeof value !== "object") return false;
  const coordinate = /^[A-Za-z0-9_-]{42,44}$/;
  return (
    value.kty === "EC" &&
    value.crv === "P-256" &&
    coordinate.test(String(value.x || "")) &&
    coordinate.test(String(value.y || ""))
  );
}

export function normalizeVitonIdQuery(value) {
  return String(value || "").replace(/[\s-]+/g, "");
}

export function isVitonIdShapedQuery(value) {
  return /^\d{4,13}$/.test(normalizeVitonIdQuery(value));
}

/**
 * Deterministic thread id for a pair, order-independent, opaque in URLs.
 */
export function buildThreadId(userA, userB) {
  const pair = [String(userA), String(userB)].sort().join(":");
  return `dm_${createHash("sha256").update(pair).digest("base64url").slice(0, 28)}`;
}

export function isValidThreadId(value) {
  return /^dm_[A-Za-z0-9_-]{28}$/.test(String(value || ""));
}

/** Firestore auto-ids, and nothing that could walk out of a subcollection. */
export function isValidDocumentId(value) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ""));
}

/**
 * File names travel back to a disk on download, so strip separators, control
 * characters and leading dots before anything stores or echoes them.
 */
export function sanitizeAttachmentName(value, fallback = "attachment") {
  return (
    String(value || "")
      .normalize("NFKC")
      .replace(/[\\/\0-\x1f\x7f]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120) || fallback
  );
}

export function attachmentKind(type) {
  return DM_ATTACHMENT_TYPES.get(String(type || "").toLowerCase()) || "";
}

/** Envelope check for one uploaded file, before any bytes are decoded. */
export function validateAttachmentUpload({ name, type, size } = {}) {
  const mime = String(type || "").toLowerCase();
  const kind = attachmentKind(mime);
  if (!kind) return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };

  const bytes = Number(size);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    return { ok: false, code: "INVALID_FILE_SIZE" };
  }
  if (bytes > DM_MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE" };
  }

  return {
    ok: true,
    value: { name: sanitizeAttachmentName(name), type: mime, size: bytes, kind },
  };
}

/**
 * A single `bytes=` range, the only form media elements send.
 *
 * Returns null when the whole file should be served, "unsatisfiable" for a
 * range past the end, or the inclusive slice bounds.
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!match || !size) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  // "bytes=-500" asks for the last 500 bytes rather than a start offset.
  let start = rawStart ? Number(rawStart) : size - Number(rawEnd);
  let end = rawStart ? (rawEnd ? Number(rawEnd) : size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end) return "unsatisfiable";

  return { start, end };
}

function ascii(bytes, offset, length) {
  let out = "";
  for (let index = offset; index < offset + length; index += 1) {
    out += String.fromCharCode(bytes[index] || 0);
  }
  return out;
}

/**
 * The declared MIME type decides how the download route labels the response,
 * so it has to match the actual bytes. Only formats the browser renders inline
 * are sniffed; a mismatch is rejected rather than relabelled.
 */
export function matchesDeclaredType(type, bytes) {
  const mime = String(type || "").toLowerCase();
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (view.length < 12) return false;

  switch (mime) {
    case "image/jpeg":
      return view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
    case "image/png":
      return ascii(view, 1, 3) === "PNG" && view[0] === 0x89;
    case "image/gif":
      return ascii(view, 0, 3) === "GIF";
    case "image/webp":
      return ascii(view, 0, 4) === "RIFF" && ascii(view, 8, 4) === "WEBP";
    case "image/avif":
      return ascii(view, 4, 4) === "ftyp";
    case "audio/webm":
      // Matroska/WebM container header.
      return view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3;
    case "video/webm":
      // Matroska/WebM container header, the same as audio/webm.
      return view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3;
    case "video/mp4":
      return ascii(view, 4, 4) === "ftyp";
    case "audio/ogg":
      return ascii(view, 0, 4) === "OggS";
    case "audio/mp4":
      return ascii(view, 4, 4) === "ftyp";
    case "audio/mpeg":
      return ascii(view, 0, 3) === "ID3" || (view[0] === 0xff && (view[1] & 0xe0) === 0xe0);
    case "application/pdf":
      return ascii(view, 0, 5) === "%PDF-";
    case "text/plain":
      // Text has no signature; reject the NUL bytes that mark a binary blob.
      return !view.subarray(0, 512).includes(0);
    default:
      return false;
  }
}

function ageMs(value, now) {
  const at = Date.parse(String(value || ""));
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return (Number.isFinite(now) ? now : Date.now()) - at;
}

/** A clock skewed into the future still reads as fresh, never as stale. */
export function isFresh(value, windowMs, now = Date.now()) {
  return ageMs(value, now) < Number(windowMs || 0);
}

export function isOnlineAt(lastSeenAt, now = Date.now()) {
  return isFresh(lastSeenAt, DM_PRESENCE_ONLINE_MS, now);
}

export function isTypingAt(typingAt, now = Date.now()) {
  return isFresh(typingAt, DM_TYPING_TTL_MS, now);
}

/**
 * Presence is a coarse signal on purpose, and it is never part of the public
 * person slice: only surfaces that already know a conversation exists between
 * the two accounts attach it, so the directory cannot be used to watch people.
 */
export function toPublicPresence(profile = {}, now = Date.now()) {
  const lastSeenAt = String(profile.lastSeenAt || "");
  const online = isOnlineAt(lastSeenAt, now);
  return {
    online,
    // An online member's exact timestamp adds nothing and tracks them; drop it.
    lastSeenAt: online ? "" : lastSeenAt,
  };
}

export function validateCiphertextPayload(payload = {}) {
  const iv = String(payload.iv || "");
  const data = String(payload.data || "");

  if (!/^[A-Za-z0-9+/=_-]{12,}$/.test(iv) || iv.length > DM_MAX_IV_LENGTH) {
    return { ok: false, code: "INVALID_IV" };
  }
  if (
    !/^[A-Za-z0-9+/=_-]+$/.test(data) ||
    data.length < 8 ||
    data.length > DM_MAX_CIPHERTEXT_LENGTH
  ) {
    return { ok: false, code: "INVALID_CIPHERTEXT" };
  }

  return { ok: true, value: { iv, data } };
}

/**
 * The only profile fields other signed-in members may see. Email, phone,
 * orders and access flags never leave the server through the people surface.
 */
/**
 * May the viewer see `peerId`'s last-seen time? Only once that person has written
 * in the conversation. Opening a thread takes one request and no consent, so it
 * proves nothing: it let any member watch any other member's presence.
 */
export function threadSharesPresence(thread, peerId) {
  if (!thread || !peerId) return false;
  return thread.spokeBy?.[peerId] === true || thread.lastMessage?.senderId === peerId;
}

export function toPublicPerson(id, profile = {}) {
  return {
    id,
    name: String(profile.name || "").trim(),
    vitonId: String(profile.vitonId || "").trim(),
    avatarUrl: String(profile.avatarUrl || "").trim(),
    city: String(profile.city || "").trim(),
    countryCode: String(profile.countryCode || "").trim(),
    tier: String(profile.tier || "").trim(),
    bio: String(profile.bio || "").trim(),
    wardrobeFocus: String(profile.wardrobeFocus || "").trim(),
    createdAt: profile.createdAt || "",
    dmPublicKey: isValidPublicJwk(profile.dmPublicKey)
      ? {
          kty: "EC",
          crv: "P-256",
          x: profile.dmPublicKey.x,
          y: profile.dmPublicKey.y,
        }
      : null,
  };
}

export function matchesPeopleQuery(person, rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (query.length < 2) return false;

  if (isVitonIdShapedQuery(query)) {
    return normalizeVitonIdQuery(person.vitonId).startsWith(
      normalizeVitonIdQuery(query)
    );
  }

  // Full-name search: every term must match somewhere in the name, so
  // "ivanov vit" finds "Vitaliy Ivanov" regardless of order.
  const name = String(person.name || "").toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => name.includes(term));
}
