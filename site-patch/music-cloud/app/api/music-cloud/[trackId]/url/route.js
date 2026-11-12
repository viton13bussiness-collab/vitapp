import { LIMITS, checkDownload, toPublicTrack } from "@/lib/music-cloud.mjs";
import { context, error, json, ownTrack } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A 15-minute signed link to the member's own track — for playing or for copying back to a computer.
 * Every link counts the whole file against today's download budget (the member's and the project's),
 * so the no-cost download allowance is never crossed by surprise.
 */
export async function GET(request, { params }) {
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const { trackId } = await params;
  const own = await ownTrack(ctx, trackId);
  if (own.response) return own.response;
  if (own.track.status !== "ready") return error("NOT_FOUND", 404);

  const size = Number(own.track.size) || 0;
  try {
    await ctx.db.runTransaction(async (tx) => {
      const [u, t] = await Promise.all([tx.get(ctx.userRef), tx.get(ctx.totalsRef)]);
      const next = checkDownload({ user: u.data() || {}, totals: t.data() || {}, size });
      if (next.error) throw Object.assign(new Error(next.error), { code: next.error });
      tx.set(ctx.userRef, next.value.user, { merge: true });
      tx.set(ctx.totalsRef, next.value.totals, { merge: true });
    });
  } catch (e) {
    if (e?.code === "DAILY_LIMIT") return error("DAILY_LIMIT", 429);
    return error("MUSIC_CLOUD_UNAVAILABLE", 503);
  }

  try {
    const [url] = await ctx.bucket.file(own.track.path).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + LIMITS.signedUrlMs });
    return json({ ok: true, url, expiresInSeconds: LIMITS.signedUrlMs / 1000, track: toPublicTrack(trackId, own.track) });
  } catch {
    return error("MUSIC_CLOUD_UNAVAILABLE", 503);
  }
}
