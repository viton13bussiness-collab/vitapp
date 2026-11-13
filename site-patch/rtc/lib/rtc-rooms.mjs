// Rooms for VITON13 meetings: the site only introduces people to each other.
//
// Video and sound never pass through the site — they go straight between the
// participants' devices (WebRTC). The site keeps a small room document in
// Firestore (expires by itself: TTL on expiresAt) and, in the server's memory,
// who is inside and a short-lived inbox per member where the devices leave each
// other their connection offers (lib/rtc-memory.mjs).

import { randomInt } from "node:crypto";

/** Codes people read aloud: no 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RTC_CODE_LENGTH = 6;
export const RTC_MAX_MEMBERS = 6;
/** A meeting holds six; a cinema hall twelve (see lib/rtc-cinema.mjs). */
export const maxMembers = (room) => (room?.kind === "cinema" ? 12 : RTC_MAX_MEMBERS);
export const RTC_ROOM_TTL_MS = 12 * 60 * 60 * 1000;
/** A signal waits for its reader at most this long. */
export const RTC_SIGNAL_TTL_MS = 10 * 60 * 1000;
/** A member who has not been seen for this long is no longer listed. */
export const RTC_MEMBER_STALE_MS = 5 * 60 * 1000;
/** An offer with its ICE candidates fits comfortably; a whole film does not. */
export const RTC_MAX_SIGNAL_DATA = 24_000;
export const RTC_MAX_TITLE = 80;
export const RTC_SIGNAL_TYPES = new Set(["offer", "answer", "candidate", "bye"]);
export const RTC_PAGE = 40;

export const ROOMS = "vitonRtcRooms";

export function newRoomCode() {
  let code = "";
  for (let i = 0; i < RTC_CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return new RegExp(`^[${CODE_ALPHABET}]{${RTC_CODE_LENGTH}}$`).test(code) ? code : "";
}

export const isValidMemberId = (value) => /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ""));

/** The public slice of a member: what the other people in the room see. */
export function toPublicMember(id, member = {}) {
  return {
    id,
    name: String(member.name || "").trim().slice(0, 80),
    vitonId: String(member.vitonId || "").trim(),
    avatarUrl: String(member.avatarUrl || "").trim(),
    joinedAt: member.joinedAt || "",
  };
}

/** Members seen recently, oldest first — the order decides who calls whom. */
export function liveMembers(room = {}, now = Date.now()) {
  return Object.entries(room.members || {})
    .filter(([, m]) => m && now - Date.parse(m.seenAt || m.joinedAt || 0) < RTC_MEMBER_STALE_MS)
    .map(([id, m]) => toPublicMember(id, m))
    .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
}

export function roomIsOpen(room, now = Date.now()) {
  return Boolean(room) && !room.closed && Date.parse(room.expiresAt?.toDate?.() || room.expiresAt || 0) > now;
}

export function isMember(room, userId, now = Date.now()) {
  return liveMembers(room, now).some((m) => m.id === userId);
}

/**
 * A light per-process limiter for the poll. The poll runs about once a second
 * during a call, so counting it in Firestore would itself cost a write per
 * poll; this keeps the guard in memory, which is enough for one Node server.
 */
const buckets = new Map();
export function pollAllowed(key, limit = 240, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.at > windowMs) {
    buckets.set(key, { at: now, n: 1, w: windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > v.w) buckets.delete(k);
    return true;
  }
  b.n += 1;
  return b.n <= limit;
}
