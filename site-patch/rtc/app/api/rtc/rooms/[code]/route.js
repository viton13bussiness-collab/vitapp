import { validateMutationRequest } from "@/lib/http-security";
import { liveMembers, roomIsOpen, maxMembers } from "@/lib/rtc-rooms.mjs";
import { cinemaExpiry, isCinema, normalizeScreening, publicScreening } from "@/lib/rtc-cinema.mjs";
import { error, json, requireCaller } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the lobby shows before joining: the title and who is already inside. A cinema shows its screening and seats. */
export async function GET(_request, { params }) {
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const snap = await state.ref.get();
  const room = snap.exists ? snap.data() : null;
  if (!roomIsOpen(room)) return error("ROOM_NOT_FOUND", 404);
  const members = liveMembers(room);
  if (isCinema(room)) return json({ ok: true, room: { ...publicScreening(room, state.user.id), members } });
  return json({ ok: true, room: { code: state.code, title: room.title || "", hostId: room.hostId, members, full: members.length >= maxMembers(room) } });
}

/** The host changes the screening: title, film, time, hall, seating — or cancels it ({cancelled: true}). */
export async function PATCH(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 4096 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;
  let payload = {};
  try { payload = await request.json(); } catch { return error("INVALID_REQUEST", 400); }
  try {
    const out = await state.db.runTransaction(async (tx) => {
      const snap = await tx.get(state.ref);
      const room = snap.exists ? snap.data() : null;
      if (!roomIsOpen(room) || !isCinema(room)) return { code: "ROOM_NOT_FOUND" };
      if (room.hostId !== state.user.id) return { code: "HOST_ONLY" };
      const norm = normalizeScreening(payload, Date.now(), room.screening);
      if (norm.error) return { code: norm.error };
      // a smaller hall must still hold everyone already seated
      for (const id of Object.keys(room.seats || {})) {
        const m = /^R(\d+)S(\d+)$/.exec(id);
        if (m && (Number(m[1]) > norm.value.rows || Number(m[2]) > norm.value.cols)) return { code: "HALL_TOO_SMALL" };
      }
      const update = { screening: norm.value, title: norm.value.title, expiresAt: cinemaExpiry(norm.value.startsAt) };
      tx.update(state.ref, update);
      return { room: { ...room, ...update } };
    });
    if (out.code === "ROOM_NOT_FOUND") return error("ROOM_NOT_FOUND", 404);
    if (out.code === "HOST_ONLY") return error("HOST_ONLY", 403);
    if (out.code) return error(out.code, 400);
    return json({ ok: true, room: publicScreening(out.room, state.user.id) });
  } catch {
    return error("RTC_UNAVAILABLE", 503);
  }
}
