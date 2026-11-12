// Shared by the room routes: who is asking, and the room they ask about.
import { NextResponse } from "next/server";
import { getFirebaseAdminDb, hasFirebaseAdminEnv } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/server-auth";
import { withNoStore } from "@/lib/http-security";
import { ROOMS, normalizeRoomCode } from "@/lib/rtc-rooms.mjs";

export const json = (payload, init) => withNoStore(NextResponse.json(payload, init));
export const error = (code, status) => json({ ok: false, code }, { status });

export async function requireCaller(params) {
  if (!hasFirebaseAdminEnv()) return { error: error("RTC_NOT_CONFIGURED", 503) };
  const code = normalizeRoomCode((await params)?.code);
  if (!code) return { error: error("ROOM_NOT_FOUND", 404) };
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return { error: error("VITON_ID_REQUIRED", 401) };
  const db = getFirebaseAdminDb();
  return { user, db, code, ref: db.collection(ROOMS).doc(code) };
}
