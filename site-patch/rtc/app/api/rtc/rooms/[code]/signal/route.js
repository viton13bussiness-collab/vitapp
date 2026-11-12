import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { validateMutationRequest } from "@/lib/http-security";
import {
  RTC_MAX_SIGNAL_DATA,
  RTC_PAGE,
  RTC_SIGNAL_TTL_MS,
  RTC_SIGNAL_TYPES,
  isMember,
  isValidMemberId,
  liveMembers,
  pollAllowed,
  roomIsOpen,
} from "@/lib/rtc-rooms.mjs";
import { error, json, requireCaller } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each member has an inbox: rooms/{code}/inbox/{memberId}/rtcSignals. A per-member
// path keeps the poll a single-field range query (no composite index needed)
// and lets a member read only what was addressed to them.
const inbox = (ref, memberId) => ref.collection("inbox").doc(memberId).collection("rtcSignals");

/**
 * Leave a connection message for one member: an offer, an answer, a batch of
 * ICE candidates or a goodbye. The app gathers candidates before it sends an
 * offer, so a whole introduction between two people is usually two writes.
 */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: RTC_MAX_SIGNAL_DATA + 1024 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return error("INVALID_REQUEST", 400);
  }
  const to = String(payload?.to || "");
  const type = String(payload?.type || "");
  const data = typeof payload?.data === "string" ? payload.data : JSON.stringify(payload?.data ?? null);
  if (!isValidMemberId(to) || to === state.user.id || !RTC_SIGNAL_TYPES.has(type)) return error("INVALID_REQUEST", 400);
  if (data.length > RTC_MAX_SIGNAL_DATA) return error("PAYLOAD_TOO_LARGE", 413);

  const budget = await consumeRateLimit({ scope: "rtc-signal", key: state.user.id, limit: 400, windowMs: 10 * 60 * 1000 }).catch(() => null);
  if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
  if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);

  const snap = await state.ref.get();
  const room = snap.exists ? snap.data() : null;
  if (!roomIsOpen(room)) return error("ROOM_NOT_FOUND", 404);
  if (!isMember(room, state.user.id)) return error("NOT_A_MEMBER", 403);
  if (!isMember(room, to)) return error("PERSON_NOT_IN_ROOM", 404);

  const now = Date.now();
  // createdAt carries a random tail so two messages in the same millisecond keep a stable order
  const createdAt = `${new Date(now).toISOString()}#${Math.random().toString(36).slice(2, 8)}`;
  await inbox(state.ref, to).add({ from: state.user.id, type, data, createdAt, expiresAt: new Date(now + RTC_SIGNAL_TTL_MS) });
  return json({ ok: true }, { status: 201 });
}

/**
 * The poll: messages addressed to me since a cursor, oldest first; with
 * `members=1` also the current members, which the app asks for every few
 * seconds rather than on every poll.
 */
export async function GET(request, { params }) {
  const state = await requireCaller(params);
  if (state.error) return state.error;
  if (!pollAllowed(`${state.user.id}:${state.code}`)) return error("TOO_MANY_REQUESTS", 429);

  const since = String(request.nextUrl.searchParams.get("since") || "").slice(0, 40);
  const withMembers = request.nextUrl.searchParams.get("members") === "1";

  let members;
  if (withMembers) {
    const snap = await state.ref.get();
    const room = snap.exists ? snap.data() : null;
    if (!roomIsOpen(room)) return error("ROOM_NOT_FOUND", 404);
    if (!isMember(room, state.user.id)) return error("NOT_A_MEMBER", 403);
    members = liveMembers(room);
  }

  let query = inbox(state.ref, state.user.id).orderBy("createdAt");
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z#[a-z0-9]{1,8}$/.test(since)) query = query.where("createdAt", ">", since);
  const items = await query.limit(RTC_PAGE).get();
  const signals = items.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, from: d.from, type: d.type, data: d.data, createdAt: d.createdAt };
  });
  return json({ ok: true, signals, ...(members ? { members } : {}) });
}
