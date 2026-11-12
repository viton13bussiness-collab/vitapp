import { NextResponse } from "next/server";
import { getFirebaseAdminDb, hasFirebaseAdminEnv } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { getSessionUser } from "@/lib/firebase/server-auth";
import { validateMutationRequest, withNoStore } from "@/lib/http-security";
import {
  ROOMS,
  RTC_MAX_TITLE,
  RTC_ROOM_TTL_MS,
  newRoomCode,
  toPublicMember,
} from "@/lib/rtc-rooms.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (payload, init) => withNoStore(NextResponse.json(payload, init));
const error = (code, status) => json({ ok: false, code }, { status });

/**
 * Open a meeting room. The creator becomes its first member; anyone with a
 * VITON ID and the code can join until the room expires (12 hours).
 */
export async function POST(request) {
  const requestError = validateMutationRequest(request, { maxBytes: 1024 });
  if (requestError) return error(requestError.code, requestError.status);
  if (!hasFirebaseAdminEnv()) return error("RTC_NOT_CONFIGURED", 503);

  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return error("VITON_ID_REQUIRED", 401);

  const budget = await consumeRateLimit({ scope: "rtc-room-create", key: user.id, limit: 20, windowMs: 60 * 60 * 1000 }).catch(() => null);
  if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
  if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const title = String(payload?.title || "").trim().slice(0, RTC_MAX_TITLE);

  const db = getFirebaseAdminDb();
  const now = new Date();
  const iso = now.toISOString();
  const me = { name: user.name || "", vitonId: user.vitonId || "", avatarUrl: user.avatarUrl || "", joinedAt: iso, seenAt: iso };

  // A fresh code; `create` fails if it is taken, so a collision just tries again.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newRoomCode();
    try {
      await db.collection(ROOMS).doc(code).create({
        code,
        title,
        hostId: user.id,
        createdAt: iso,
        expiresAt: new Date(now.getTime() + RTC_ROOM_TTL_MS),
        members: { [user.id]: me },
      });
      return json({ ok: true, room: { code, title, hostId: user.id, members: [toPublicMember(user.id, me)] }, me: { id: user.id, name: me.name } }, { status: 201 });
    } catch (e) {
      if (e?.code !== 6 && !/already exists/i.test(String(e?.message || ""))) return error("RTC_UNAVAILABLE", 503);
    }
  }
  return error("RTC_UNAVAILABLE", 503);
}
