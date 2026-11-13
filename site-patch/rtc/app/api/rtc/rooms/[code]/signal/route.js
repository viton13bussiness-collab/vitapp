import { validateMutationRequest } from "@/lib/http-security";
import { RTC_MAX_SIGNAL_DATA, RTC_SIGNAL_TYPES, isValidMemberId, pollAllowed } from "@/lib/rtc-rooms.mjs";
import { memoryMembers, pushSignal, takeSignals } from "@/lib/rtc-memory.mjs";
import { error, json, requireCaller } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signals live in the server's memory (lib/rtc-memory.mjs), one inbox per member:
// nothing here reads or writes Firestore. Someone memory does not know — the
// server restarted, or they went quiet for five minutes — hears RTC_REJOIN (409)
// and joins again through /presence; their call keeps running meanwhile.
const STATUS = { RTC_REJOIN: 409, ROOM_NOT_FOUND: 404, PERSON_NOT_IN_ROOM: 404, PAYLOAD_TOO_LARGE: 413, RTC_BUSY: 503 };
const fail = (code) => error(code === "RTC_BUSY" ? "RTC_UNAVAILABLE" : code, STATUS[code] || 400);

/**
 * Leave a connection message for one member: an offer, an answer, a batch of
 * ICE candidates or a goodbye. The app gathers candidates before it sends an
 * offer, so a whole introduction between two people is usually two messages.
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
  // counted in memory too: a Firestore counter would cost a read and a write per message
  if (!pollAllowed(`send:${state.user.id}`, 400, 10 * 60 * 1000)) return error("TOO_MANY_REQUESTS", 429);

  const out = pushSignal(state.code, state.user.id, to, type, data);
  if (out.error) return fail(out.error);
  return json({ ok: true }, { status: 201 });
}

/**
 * The poll: messages addressed to me after a cursor, oldest first; with
 * `members=1` also who is inside now.
 */
export async function GET(request, { params }) {
  const state = await requireCaller(params);
  if (state.error) return state.error;
  if (!pollAllowed(`${state.user.id}:${state.code}`)) return error("TOO_MANY_REQUESTS", 429);

  const since = String(request.nextUrl.searchParams.get("since") || "").slice(0, 40);
  const withMembers = request.nextUrl.searchParams.get("members") === "1";
  const out = takeSignals(state.code, state.user.id, since);
  if (out.error) return fail(out.error);
  return json({ ok: true, signals: out.signals, ...(withMembers ? { members: memoryMembers(state.code) } : {}) });
}
