import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { validateMutationRequest } from "@/lib/http-security";
import { maxMembers, roomIsOpen } from "@/lib/rtc-rooms.mjs";
import { isCinema, mayJoinHall } from "@/lib/rtc-cinema.mjs";
import { joinMemory, leaveMemory, memoryMembers, touchMemory } from "@/lib/rtc-memory.mjs";
import { error, expiryMs, json, requireCaller } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * join · heartbeat · leave.
 *
 * Only join looks at Firestore: one read of the room (open, not cancelled, a
 * seat in the cinema) and the rate-limit counter. Who is inside lives in the
 * server's memory (lib/rtc-memory.mjs), so the heartbeat — every two minutes
 * from the app — and leaving cost nothing.
 */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 256 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return error("INVALID_REQUEST", 400);
  }
  const action = String(payload?.action || "");
  if (!["join", "heartbeat", "leave"].includes(action)) return error("INVALID_REQUEST", 400);
  const { user, code } = state;
  const me = { id: user.id, name: user.name || "" };

  if (action === "leave") return json({ ok: true, me, members: leaveMemory(code, user.id) });
  if (action === "heartbeat") {
    const seen = touchMemory(code, user.id);
    if (seen === "expired") return error("ROOM_NOT_FOUND", 404);
    // unknown here (the server restarted, or the person went quiet too long): the app joins again
    if (seen !== "ok") return error("RTC_REJOIN", 409);
    return json({ ok: true, me, members: memoryMembers(code) });
  }

  const budget = await consumeRateLimit({ scope: "rtc-room-join", key: user.id, limit: 60, windowMs: 60 * 60 * 1000 }).catch(() => null);
  if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
  if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);

  let room;
  try {
    const snap = await state.ref.get();
    room = snap.exists ? snap.data() : null;
  } catch {
    return error("RTC_UNAVAILABLE", 503);
  }
  if (!roomIsOpen(room)) return error("ROOM_NOT_FOUND", 404);
  // In a cinema only the host and people sitting on a seat come into the hall's call.
  if (isCinema(room) && room.screening?.cancelled) return error("ROOM_NOT_FOUND", 404);
  if (isCinema(room) && !mayJoinHall(room, user.id)) return error("NO_SEAT", 403);

  const joined = joinMemory(code, user, { max: maxMembers(room), expiresAt: expiryMs(room) });
  if (joined.error === "ROOM_FULL") return error("ROOM_FULL", 409);
  if (joined.error) return error("RTC_UNAVAILABLE", 503);
  return json({ ok: true, me, members: joined.members });
}
