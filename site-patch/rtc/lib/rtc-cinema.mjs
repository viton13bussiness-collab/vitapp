// The cinema of VITON13: a screening in a hall with real seats and tickets.
//
// A screening is a room of the meetings API (vitonRtcRooms/{CODE}) with kind
// "cinema": the host's settings, the seats people took, the tickets the host
// issued and who was admitted by them. The film and the viewers' cameras never
// pass through the site — they go straight between the devices (WebRTC).
//
// Everything here is pure: it takes the room as read inside a transaction and
// returns the fields to write, so the routes stay short and the rules testable.

import { randomInt } from "node:crypto";

/** A WebRTC mesh: every viewer sends their camera to every other viewer. Twelve
 *  small frames (192×192, 12 fps, ~80 kbit/s each) is what an ordinary home
 *  uplink carries; beyond that a media server would be needed. */
export const CINEMA_MAX_VIEWERS = 12;
export const CINEMA_ROWS = [3, 8];
export const CINEMA_COLS = [6, 12];
export const CINEMA_MAX_TICKETS = 60;
export const CINEMA_MAX_USES = 12;
export const CINEMA_AFTER_START_MS = 8 * 60 * 60 * 1000;      // a screening stays open this long after it starts
export const CINEMA_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;       // and can be planned this far ahead
/** Row names as cinemas print them: А, Б, В… (no Ё, Й). */
export const ROW_LETTERS = "АБВГДЕЖЗ";
export const FILM_KINDS = new Set(["video", "screen", "youtube"]);
const TICKET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export const isCinema = (room) => room?.kind === "cinema";
export const seatId = (row, num) => `R${row}S${num}`;
export function parseSeat(id, screening) {
  const m = /^R(\d{1,2})S(\d{1,2})$/.exec(String(id || ""));
  if (!m) return null;
  const row = Number(m[1]), num = Number(m[2]);
  if (row < 1 || num < 1 || row > (screening?.rows || 0) || num > (screening?.cols || 0)) return null;
  return { row, num, id: seatId(row, num) };
}
export const seatLabel = (id) => { const m = /^R(\d+)S(\d+)$/.exec(String(id || "")); return m ? `ряд ${ROW_LETTERS[Number(m[1]) - 1] || m[1]}, место ${m[2]}` : ""; };

/** Settings sent by the host → clean settings, or an error code. */
export function normalizeScreening(input = {}, now = Date.now(), current = null) {
  const src = { ...(current || {}), ...(input || {}) };
  const title = String(src.title ?? "").trim().slice(0, 80);
  if (!title) return { error: "TITLE_REQUIRED" };
  const kind = String(src.film?.kind || "video");
  if (!FILM_KINDS.has(kind)) return { error: "INVALID_FILM" };
  let url = String(src.film?.src || "").trim().slice(0, 600);
  if (kind === "screen") url = "";
  else {
    let parsed; try { parsed = new URL(url); } catch { return { error: "INVALID_FILM" }; }
    if (!/^https?:$/.test(parsed.protocol)) return { error: "INVALID_FILM" };
    if (kind === "youtube" && !YT.test(url)) return { error: "INVALID_FILM" };
  }
  const startsAt = Date.parse(src.startsAt || "");
  if (!Number.isFinite(startsAt) || startsAt < now - CINEMA_AFTER_START_MS || startsAt > now + CINEMA_AHEAD_MS) return { error: "INVALID_TIME" };
  const rows = Math.round(Number(src.rows)), cols = Math.round(Number(src.cols));
  if (!(rows >= CINEMA_ROWS[0] && rows <= CINEMA_ROWS[1] && cols >= CINEMA_COLS[0] && cols <= CINEMA_COLS[1])) return { error: "INVALID_HALL" };
  const seating = src.seating === "assigned" ? "assigned" : "open";
  const note = String(src.note ?? "").trim().slice(0, 200);
  return { value: { title, film: { kind, src: url }, startsAt: new Date(startsAt).toISOString(), rows, cols, seating, note, cancelled: Boolean(src.cancelled) } };
}
export const cinemaExpiry = (startsAtIso, now = Date.now()) => new Date(Math.max(Date.parse(startsAtIso) + CINEMA_AFTER_START_MS, now + 2 * 60 * 60 * 1000));

/** Ticket codes carry the hall: «K7MPQ2-8FHX» — so a ticket finds its screening alone. */
export function newTicketCode(roomCode, taken = {}) {
  for (let i = 0; i < 50; i += 1) {
    let t = ""; for (let j = 0; j < 4; j += 1) t += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)];
    if (!taken[t]) return t;
  }
  return "";
}
export function parseTicket(value) {
  const s = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ok = new RegExp(`^[${TICKET_ALPHABET}]{10}$`).test(s);
  return ok ? { room: s.slice(0, 6), key: s.slice(6) } : null;
}
export const ticketText = (roomCode, key) => `${roomCode}-${key}`;

/** Issue tickets: `count` shareable or one per listed seat. Returns the new tickets map or an error. */
export function issueTickets(room, { count = 1, seats = [], uses = 1, label = "" } = {}) {
  const scr = room.screening, tickets = { ...(room.tickets || {}) };
  const list = Array.isArray(seats) ? seats.map((s) => parseSeat(s, scr)?.id).filter(Boolean) : [];
  const n = list.length || Math.max(1, Math.min(Math.round(Number(count)) || 1, 30));
  if (Object.keys(tickets).length + n > CINEMA_MAX_TICKETS) return { error: "TOO_MANY_TICKETS" };
  const bound = new Set(Object.values(tickets).map((t) => t.seat).filter(Boolean));
  const made = [];
  for (let i = 0; i < n; i += 1) {
    const seat = list[i] || null;
    if (seat && bound.has(seat)) return { error: "SEAT_HAS_TICKET" };
    const key = newTicketCode(room.code, tickets); if (!key) return { error: "RTC_UNAVAILABLE" };
    tickets[key] = { seat, uses: seat ? 1 : Math.max(1, Math.min(Math.round(Number(uses)) || 1, CINEMA_MAX_USES)), used: {}, label: String(label || "").trim().slice(0, 40), createdAt: new Date().toISOString() };
    if (seat) bound.add(seat);
    made.push(key);
  }
  return { tickets, made };
}

/** Let a person in by a ticket. Idempotent for someone already admitted. */
export function admit(room, user, key, now = Date.now()) {
  if (room.banned?.[user.id]) return { error: "NOT_ADMITTED" };
  const admitted = { ...(room.admitted || {}) };
  if (admitted[user.id] || room.hostId === user.id) return { admitted, already: true };
  const t = room.tickets?.[key];
  if (!t) return { error: "TICKET_NOT_FOUND" };
  if (Object.keys(t.used || {}).length >= (t.uses || 1)) return { error: "TICKET_USED" };
  if (Object.keys(admitted).length >= CINEMA_MAX_VIEWERS - 1) return { error: "HALL_FULL" };          // twelve with the host
  const tickets = { ...room.tickets, [key]: { ...t, used: { ...(t.used || {}), [user.id]: new Date(now).toISOString() } } };
  admitted[user.id] = { ticket: key, name: String(user.name || "").slice(0, 80), at: new Date(now).toISOString(), seat: t.seat || null };
  const seats = { ...(room.seats || {}) };
  if (t.seat && !seats[t.seat]) seats[t.seat] = { uid: user.id, name: admitted[user.id].name };
  return { admitted, tickets, seats, admittedIds: [...new Set([...(room.admittedIds || []), user.id])] };
}

/** Take a seat (or null to stand up). Assigned seating keeps people on their ticket's seat. */
export function claimSeat(room, user, seat) {
  const scr = room.screening, host = room.hostId === user.id, entry = room.admitted?.[user.id];
  if (!host && !entry) return { error: "NOT_ADMITTED" };
  const seats = {};
  for (const [id, s] of Object.entries(room.seats || {})) if (s?.uid !== user.id) seats[id] = s;     // leave the old seat
  if (seat == null) return { seats };
  const p = parseSeat(seat, scr); if (!p) return { error: "INVALID_SEAT" };
  if (seats[p.id]) return { error: "SEAT_TAKEN" };
  if (!host && scr.seating === "assigned" && entry.seat && entry.seat !== p.id) return { error: "SEAT_ASSIGNED" };
  const ticketSeat = Object.entries(room.tickets || {}).find(([, t]) => t.seat === p.id);
  if (!host && ticketSeat && ticketSeat[0] !== entry?.ticket) return { error: "SEAT_RESERVED" };
  const seated = new Set(Object.values(seats).map((s) => s.uid));
  if (seated.size >= CINEMA_MAX_VIEWERS) return { error: "HALL_FULL" };
  seats[p.id] = { uid: user.id, name: String(entry?.name || user.name || "").slice(0, 80) };
  return { seats };
}

/** The host sends someone out: their seat, admission and room membership go; they can't come back. */
export function kick(room, uid) {
  const seats = {}; for (const [id, s] of Object.entries(room.seats || {})) if (s?.uid !== uid) seats[id] = s;
  const admitted = { ...(room.admitted || {}) }; delete admitted[uid];
  const members = { ...(room.members || {}) }; delete members[uid];
  return { seats, admitted, members, banned: { ...(room.banned || {}), [uid]: true }, admittedIds: (room.admittedIds || []).filter((x) => x !== uid) };
}

export function revokeTicket(room, key) {
  const t = room.tickets?.[key]; if (!t) return { error: "TICKET_NOT_FOUND" };
  const tickets = { ...room.tickets }; delete tickets[key];
  const out = kickMany(room, Object.keys(t.used || {}));
  return { ...out, tickets };
}
function kickMany(room, uids) { let r = room, out = {}; for (const uid of uids) { out = kick(r, uid); r = { ...r, ...out }; } delete out.banned; return { seats: r.seats || {}, admitted: r.admitted || {}, members: r.members || {}, admittedIds: r.admittedIds || [] }; }

/** May this person be in the hall's call right now? Host always; others with a seat. */
export function mayJoinHall(room, uid) {
  if (room.banned?.[uid]) return false;
  if (room.hostId === uid) return true;
  return Object.values(room.seats || {}).some((s) => s?.uid === uid);
}

/** What a person sees of a screening. Tickets only for the host. */
export function publicScreening(room, viewerId) {
  const host = room.hostId === viewerId, me = room.admitted?.[viewerId];
  const seats = Object.fromEntries(Object.entries(room.seats || {}).map(([id, s]) => [id, { uid: s.uid, name: s.name || "" }]));
  const reserved = Object.values(room.tickets || {}).map((t) => t.seat).filter(Boolean);
  const out = {
    code: room.code, kind: "cinema", title: room.screening?.title || room.title || "", hostId: room.hostId, hostName: room.hostName || "",
    screening: room.screening, seats, reserved, viewers: Object.keys(room.admitted || {}).length, max: CINEMA_MAX_VIEWERS,
    you: { host, admitted: host || Boolean(me), seat: Object.entries(room.seats || {}).find(([, s]) => s?.uid === viewerId)?.[0] || null, ticketSeat: me?.seat || null, banned: Boolean(room.banned?.[viewerId]) },
  };
  if (host) {
    out.tickets = Object.entries(room.tickets || {}).map(([key, t]) => ({ code: ticketText(room.code, key), key, seat: t.seat, uses: t.uses, label: t.label || "",
      used: Object.keys(t.used || {}).map((uid) => ({ uid, name: room.admitted?.[uid]?.name || "" })) }));
    out.admitted = Object.entries(room.admitted || {}).map(([uid, a]) => ({ uid, name: a.name, ticket: a.ticket, seat: Object.entries(room.seats || {}).find(([, s]) => s?.uid === uid)?.[0] || null }));
  }
  return out;
}
