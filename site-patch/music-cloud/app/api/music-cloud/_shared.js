import { NextResponse } from "next/server";
import { getFirebaseAdminBucket, getFirebaseAdminDb, hasFirebaseStorageEnv } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/server-auth";
import { withNoStore } from "@/lib/http-security";
import { TOTALS, TRACK_ID, USERS } from "@/lib/music-cloud.mjs";

export const json = (payload, init) => withNoStore(NextResponse.json(payload, init));
export const error = (code, status) => json({ ok: false, code }, { status });

/**
 * The signed-in VITON ID member and the Firestore/Storage handles, or an error response.
 * VIT subscriptions still live in the VITON13 app: the app lets only subscribers reach these routes.
 * Once subscriptions are kept on the site, check them here as well (see README).
 */
export async function context() {
  if (!hasFirebaseStorageEnv()) return { response: error("MUSIC_CLOUD_NOT_CONFIGURED", 503) };
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return { response: error("VITON_ID_REQUIRED", 401) };
  const db = getFirebaseAdminDb();
  return {
    user, db, bucket: getFirebaseAdminBucket(),
    userRef: db.collection(USERS).doc(user.id),
    totalsRef: db.collection(TOTALS).doc("project"),
  };
}

/** The member's own track, or an error response. */
export async function ownTrack(ctx, trackId) {
  if (!TRACK_ID.test(String(trackId || ""))) return { response: error("NOT_FOUND", 404) };
  const ref = ctx.userRef.collection("tracks").doc(trackId);
  const snap = await ref.get();
  if (!snap.exists) return { response: error("NOT_FOUND", 404) };
  return { ref, track: snap.data() };
}
