// Live signalling for meetings and the cinema, kept in the site server's memory.
//
// Who is in a room right now and the short notes the devices leave each other
// (offer, answer, goodbye) live only as long as a call does, so they are kept
// here instead of Firestore: polling a room costs no reads and no writes at all.
// Firestore keeps what must outlive a process — the room itself, a cinema's
// seats and tickets — and is checked once when someone joins.
//
// The site runs as one Node process (`next start`), so every request sees the
// same store. A restart forgets it; the app then hears RTC_REJOIN, joins again
// quietly and the calls, which run between the devices, go on. Several
// processes would need a shared store (Redis) or sticky sessions instead.

import { Buffer } from "node:buffer";
import { RTC_MAX_SIGNAL_DATA, RTC_MEMBER_STALE_MS, RTC_PAGE, RTC_SIGNAL_TTL_MS, toPublicMember } from "./rtc-rooms.mjs";

export const MEMORY_MAX_ROOMS = 2_000;
export const MEMORY_MAX_MEMBERS = 16;
export const MEMORY_MAX_INBOX = 200;
export const MEMORY_MAX_BYTES = 64 * 1024 * 1024;
const SIGNAL_OVERHEAD = 200;
const SWEEP_EVERY_MS = 10_000;

/** One store per process; a dev hot reload reuses it instead of making a second one. */
const store = (globalThis.__vitonRtcMemory ||= {
  rooms: new Map(),
  bytes: 0,
  // ids grow across restarts too (they start from the clock), so a cursor kept by the app stays below new ids
  seq: Date.now() * 1000,
  sweptAt: 0,
});

const sizeOf = (signal) => signal.size;

function dropInbox(room, uid) {
  for (const s of room.inbox.get(uid) || []) store.bytes -= sizeOf(s);
  room.inbox.delete(uid);
}

function dropRoom(code) {
  const room = store.rooms.get(code);
  if (!room) return;
  for (const uid of [...room.inbox.keys()]) dropInbox(room, uid);
  store.rooms.delete(code);
}

/** Members silent for five minutes, notes older than ten, rooms left empty or past their time — gone. */
export function sweepMemory(now = Date.now(), force = false) {
  if (!force && now - store.sweptAt < SWEEP_EVERY_MS) return;
  store.sweptAt = now;
  for (const [code, room] of store.rooms) {
    if (room.expiresAt && room.expiresAt <= now) { dropRoom(code); continue; }
    for (const [uid, m] of room.members) {
      if (now - m.seenAt >= RTC_MEMBER_STALE_MS) { room.members.delete(uid); dropInbox(room, uid); }
    }
    for (const [uid, list] of room.inbox) {
      if (!room.members.has(uid)) { dropInbox(room, uid); continue; }
      const keep = list.filter((s) => now - s.at < RTC_SIGNAL_TTL_MS);
      for (const s of list) if (!keep.includes(s)) store.bytes -= sizeOf(s);
      room.inbox.set(uid, keep);
    }
    if (!room.members.size) dropRoom(code);
  }
}

function liveRoom(code, now) {
  sweepMemory(now);
  const room = store.rooms.get(code);
  if (!room) return null;
  if (room.expiresAt && room.expiresAt <= now) { dropRoom(code); return { expired: true }; }
  return room;
}

/** Members in join order — the order decides who calls whom. */
export function memoryMembers(code, now = Date.now()) {
  const room = liveRoom(code, now);
  if (!room || room.expired) return [];
  return [...room.members.entries()]
    .filter(([, m]) => now - m.seenAt < RTC_MEMBER_STALE_MS)
    .map(([id, m]) => toPublicMember(id, m))
    .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
}

/**
 * Put a person into the live room, after the caller checked the room in Firestore.
 * Joining again (a reload, or after a restart) gives a fresh seat and an empty inbox:
 * notes left for an earlier visit are stale.
 */
export function joinMemory(code, user, { max = MEMORY_MAX_MEMBERS, expiresAt = 0 } = {}, now = Date.now()) {
  let room = liveRoom(code, now);
  if (room?.expired) room = null;
  if (!room) {
    if (store.rooms.size >= MEMORY_MAX_ROOMS) sweepMemory(now, true);
    if (store.rooms.size >= MEMORY_MAX_ROOMS) return { error: "RTC_BUSY" };
    room = { members: new Map(), inbox: new Map(), expiresAt: 0 };
    store.rooms.set(code, room);
  }
  if (expiresAt) room.expiresAt = expiresAt;
  const others = memoryMembers(code, now).filter((m) => m.id !== user.id);
  if (others.length >= Math.min(max, MEMORY_MAX_MEMBERS)) {
    if (!room.members.size) dropRoom(code);
    return { error: "ROOM_FULL" };
  }
  // join order decides who calls whom, so two people never share a moment: a tie moves one a millisecond on
  const last = Math.max(0, ...others.map((m) => Date.parse(m.joinedAt) || 0));
  const iso = new Date(Math.max(now, last + 1)).toISOString();
  dropInbox(room, user.id);
  room.members.set(user.id, {
    name: String(user.name || "").slice(0, 80),
    vitonId: String(user.vitonId || ""),
    avatarUrl: String(user.avatarUrl || "").slice(0, 600),
    joinedAt: iso,
    seenAt: now,
  });
  return { members: memoryMembers(code, now), me: { id: user.id, joinedAt: iso } };
}

/** "Still here": memory only. → "ok" | "rejoin" | "expired" */
export function touchMemory(code, uid, now = Date.now()) {
  const room = liveRoom(code, now);
  if (room?.expired) return "expired";
  const m = room?.members.get(uid);
  if (!m) return "rejoin";
  m.seenAt = now;
  return "ok";
}

export function leaveMemory(code, uid, now = Date.now()) {
  const room = liveRoom(code, now);
  if (!room || room.expired) return [];
  room.members.delete(uid);
  dropInbox(room, uid);
  if (!room.members.size) { dropRoom(code); return []; }
  return memoryMembers(code, now);
}

/** Take out everyone the rule says may no longer be inside (a cinema's kick or a revoked ticket). */
export function pruneMemory(code, mayStay) {
  const room = store.rooms.get(code);
  if (!room) return;
  for (const uid of [...room.members.keys()]) {
    if (!mayStay(uid)) { room.members.delete(uid); dropInbox(room, uid); }
  }
  if (!room.members.size) dropRoom(code);
}

/** The host moved a screening: the live room lives as long as the new time says. */
export function setMemoryExpiry(code, expiresAt) {
  const room = store.rooms.get(code);
  if (room && expiresAt) room.expiresAt = expiresAt;
}

/** Leave a note for one member. → { ok } | { error } */
export function pushSignal(code, from, to, type, data, now = Date.now()) {
  const room = liveRoom(code, now);
  if (room?.expired) return { error: "ROOM_NOT_FOUND" };
  const sender = room?.members.get(from);
  if (!sender) return { error: "RTC_REJOIN" };
  sender.seenAt = now;
  if (!room.members.has(to)) return { error: "PERSON_NOT_IN_ROOM" };
  const text = String(data);
  if (text.length > RTC_MAX_SIGNAL_DATA) return { error: "PAYLOAD_TOO_LARGE" };
  const size = Buffer.byteLength(text) + SIGNAL_OVERHEAD;
  if (store.bytes + size > MEMORY_MAX_BYTES) sweepMemory(now, true);
  if (store.bytes + size > MEMORY_MAX_BYTES) return { error: "RTC_BUSY" };
  store.seq += 1;
  const list = room.inbox.get(to) || [];
  list.push({ id: store.seq, from, type, data: text, at: now, size });
  store.bytes += size;
  while (list.length > MEMORY_MAX_INBOX) store.bytes -= sizeOf(list.shift());
  room.inbox.set(to, list);
  return { ok: true };
}

/** The cursor the app sends back: `<iso>#<id in base 36>`; anything else reads from the start. */
export function cursorOf(since) {
  const m = /#([0-9a-z]{1,12})$/.exec(String(since || ""));
  const n = m ? parseInt(m[1], 36) : 0;
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * The poll: notes addressed to me after the cursor, oldest first. What the app
 * already acknowledged (at or below its cursor) is forgotten. Polling counts as
 * being here. → { signals } | { error }
 */
export function takeSignals(code, uid, since, now = Date.now()) {
  const room = liveRoom(code, now);
  if (room?.expired) return { error: "ROOM_NOT_FOUND" };
  const m = room?.members.get(uid);
  if (!m) return { error: "RTC_REJOIN" };
  m.seenAt = now;
  const after = cursorOf(since);
  const list = room.inbox.get(uid) || [];
  const keep = [];
  for (const s of list) {
    if (s.id <= after || now - s.at >= RTC_SIGNAL_TTL_MS) store.bytes -= sizeOf(s);
    else keep.push(s);
  }
  room.inbox.set(uid, keep);
  const signals = keep.slice(0, RTC_PAGE).map((s) => ({
    id: String(s.id),
    from: s.from,
    type: s.type,
    data: s.data,
    createdAt: `${new Date(s.at).toISOString()}#${s.id.toString(36)}`,
  }));
  return { signals };
}

/** For checks and the README numbers: how much the store holds. */
export function memoryStats() {
  let members = 0, signals = 0;
  for (const room of store.rooms.values()) {
    members += room.members.size;
    for (const list of room.inbox.values()) signals += list.length;
  }
  return { rooms: store.rooms.size, members, signals, bytes: store.bytes };
}
