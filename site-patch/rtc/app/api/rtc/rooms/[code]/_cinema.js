// The cinema routes share one shape: read the screening in a transaction, let a pure rule from
// lib/rtc-cinema.mjs decide, write what it returns, answer with what this person may see.
import { roomIsOpen } from "@/lib/rtc-rooms.mjs";
import { isCinema, publicScreening } from "@/lib/rtc-cinema.mjs";
import { error, json } from "./_shared";

const STATUS = { ROOM_NOT_FOUND: 404, TICKET_NOT_FOUND: 404, HOST_ONLY: 403, NOT_ADMITTED: 403, SEAT_TAKEN: 409, SEAT_RESERVED: 409, SEAT_ASSIGNED: 409, HALL_FULL: 409, TICKET_USED: 409, SEAT_HAS_TICKET: 409 };

/** rule(room) → { error } or the fields to update (plus an optional `extra` merged into the answer). */
export async function cinemaTransaction(state, rule, { hostOnly = false } = {}) {
  try {
    const out = await state.db.runTransaction(async (tx) => {
      const snap = await tx.get(state.ref);
      const room = snap.exists ? snap.data() : null;
      if (!roomIsOpen(room) || !isCinema(room) || room.screening?.cancelled) return { code: "ROOM_NOT_FOUND" };
      if (hostOnly && room.hostId !== state.user.id) return { code: "HOST_ONLY" };
      const r = rule(room);
      if (r.error) return { code: r.error };
      const { extra, ...update } = r;
      delete update.already; delete update.made;
      if (Object.keys(update).length) tx.update(state.ref, update);
      return { room: { ...room, ...update }, extra: { ...(extra || {}), ...(r.made ? { made: r.made } : {}) } };
    });
    if (out.code) return error(out.code, STATUS[out.code] || 400);
    return json({ ok: true, room: publicScreening(out.room, state.user.id), ...out.extra });
  } catch {
    return error("RTC_UNAVAILABLE", 503);
  }
}

export async function readJson(request) { try { return await request.json(); } catch { return null; } }
