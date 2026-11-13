// Shared by the room routes: who is asking, and the room they ask about.
import { NextResponse } from "next/server";
import { getFirebaseAdminDb, hasFirebaseAdminEnv } from "@/lib/firebase/admin";
import { withNoStore } from "@/lib/http-security";
import { ROOMS, normalizeRoomCode } from "@/lib/rtc-rooms.mjs";
import { getRtcSessionUser } from "../../_session";

export const json = (payload, init) => withNoStore(NextResponse.json(payload, init));
export const error = (code, status) => json({ ok: false, code }, { status });

/** The session comes from a short in-memory cache (../../_session.js): a poll reads nothing from Firestore. */
export async function requireCaller(params) {
  if (!hasFirebaseAdminEnv()) return { error: error("RTC_NOT_CONFIGURED", 503) };
  const code = normalizeRoomCode((await params)?.code);
  if (!code) return { error: error("ROOM_NOT_FOUND", 404) };
  const user = await getRtcSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return { error: error("VITON_ID_REQUIRED", 401) };
  const db = getFirebaseAdminDb();
  return { user, db, code, ref: db.collection(ROOMS).doc(code) };
}

/** A Firestore expiry (Timestamp, Date or string) in milliseconds. */
export const expiryMs = (room) => Date.parse(room?.expiresAt?.toDate?.() || room?.expiresAt || 0) || 0;
