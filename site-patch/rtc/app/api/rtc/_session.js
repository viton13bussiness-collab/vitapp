// Who is asking, for the meetings and cinema routes — without a Firestore read on every poll.
//
// getSessionUser() verifies the session cookie and reads the person's profile; a call polls
// a few times a minute, so the verified person is kept here for three minutes, keyed by a
// hash of the cookie (the cookie itself is not stored). A miss asks getSessionUser() again,
// so a suspended or signed-out account is turned away within three minutes at most.
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, getSessionUser } from "@/lib/firebase/server-auth";

const KEEP_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 5_000;
const cache = (globalThis.__vitonRtcSessions ||= new Map());

export async function getRtcSessionUser() {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return null;
  const key = createHash("sha256").update(value).digest("hex");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < KEEP_MS) return hit.user;
  if (hit) cache.delete(key);

  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return null;
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (now - v.at >= KEEP_MS) cache.delete(k);
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  }
  cache.set(key, { user, at: now });
  return user;
}
