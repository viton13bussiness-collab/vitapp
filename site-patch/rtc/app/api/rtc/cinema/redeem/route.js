import { NextResponse } from "next/server";
import { getFirebaseAdminDb, hasFirebaseAdminEnv } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { getSessionUser } from "@/lib/firebase/server-auth";
import { validateMutationRequest, withNoStore } from "@/lib/http-security";
import { ROOMS } from "@/lib/rtc-rooms.mjs";
import { admit, parseTicket } from "@/lib/rtc-cinema.mjs";
import { cinemaTransaction } from "../../rooms/[code]/_cinema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (code, status) => withNoStore(NextResponse.json({ ok: false, code }, { status }));

/** A ticket «K7MPQ2-8FHX» lets its holder into the screening K7MPQ2. Guessing is slowed by a rate limit. */
export async function POST(request) {
  const requestError = validateMutationRequest(request, { maxBytes: 256 });
  if (requestError) return error(requestError.code, requestError.status);
  if (!hasFirebaseAdminEnv()) return error("RTC_NOT_CONFIGURED", 503);
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return error("VITON_ID_REQUIRED", 401);
  const budget = await consumeRateLimit({ scope: "rtc-ticket", key: user.id, limit: 30, windowMs: 60 * 60 * 1000 }).catch(() => null);
  if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
  if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);
  let payload = {};
  try { payload = await request.json(); } catch { return error("INVALID_REQUEST", 400); }
  const t = parseTicket(payload?.ticket);
  if (!t) return error("TICKET_NOT_FOUND", 404);
  const db = getFirebaseAdminDb();
  return cinemaTransaction({ db, user, code: t.room, ref: db.collection(ROOMS).doc(t.room) }, (room) => admit(room, user, t.key));
}
