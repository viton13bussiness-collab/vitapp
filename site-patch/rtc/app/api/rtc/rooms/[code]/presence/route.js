import { FieldValue } from "firebase-admin/firestore";
import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { validateMutationRequest } from "@/lib/http-security";
import { liveMembers, roomIsOpen, RTC_MAX_MEMBERS, RTC_MEMBER_STALE_MS } from "@/lib/rtc-rooms.mjs";
import { error, json, requireCaller } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * join · heartbeat · leave.
 *
 * The heartbeat is sparse on purpose (every two minutes from the app): the
 * devices already know from their own connection whether the others are there;
 * the room only needs to know it well enough to introduce a newcomer.
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

  if (action === "join") {
    const budget = await consumeRateLimit({ scope: "rtc-room-join", key: state.user.id, limit: 60, windowMs: 60 * 60 * 1000 }).catch(() => null);
    if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
    if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const { user, ref } = state;

  try {
    const result = await state.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const room = snap.exists ? snap.data() : null;
      if (!roomIsOpen(room, nowMs)) return { code: "ROOM_NOT_FOUND" };
      const members = liveMembers(room, nowMs);
      const inside = members.some((m) => m.id === user.id);

      if (action === "leave") {
        if (inside) tx.update(ref, { [`members.${user.id}`]: FieldValue.delete() });
        return { members: members.filter((m) => m.id !== user.id) };
      }
      if (action === "heartbeat") {
        if (!inside) return { code: "NOT_A_MEMBER" };
        tx.update(ref, { [`members.${user.id}.seenAt`]: now });
        return { members };
      }
      // join: a seat for a newcomer; coming back after a reload takes a fresh seat
      if (!inside && members.length >= RTC_MAX_MEMBERS) return { code: "ROOM_FULL" };
      const update = { [`members.${user.id}`]: { name: user.name || "", vitonId: user.vitonId || "", avatarUrl: user.avatarUrl || "", joinedAt: now, seenAt: now } };
      // members who went quiet are tidied away while we are here
      for (const [id, m] of Object.entries(room.members || {})) {
        if (id !== user.id && nowMs - Date.parse(m?.seenAt || m?.joinedAt || 0) >= RTC_MEMBER_STALE_MS) update[`members.${id}`] = FieldValue.delete();
      }
      tx.update(ref, update);
      const me = { id: user.id, name: user.name || "", vitonId: user.vitonId || "", avatarUrl: user.avatarUrl || "", joinedAt: now };
      return { members: [...members.filter((m) => m.id !== user.id), me] };
    });
    if (result.code === "ROOM_NOT_FOUND") return error("ROOM_NOT_FOUND", 404);
    if (result.code === "ROOM_FULL") return error("ROOM_FULL", 409);
    if (result.code === "NOT_A_MEMBER") return error("NOT_A_MEMBER", 403);
    return json({ ok: true, me: { id: user.id, name: user.name || "" }, members: result.members });
  } catch {
    return error("RTC_UNAVAILABLE", 503);
  }
}
