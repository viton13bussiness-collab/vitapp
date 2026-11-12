import { FieldValue } from "firebase-admin/firestore";
import { LIMITS, toPublicTrack } from "@/lib/music-cloud.mjs";
import { context, json } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The member's tracks in the VIT Music cloud and how much of the quota they use. Unfinished uploads older than two hours are let go. */
export async function GET() {
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const snap = await ctx.userRef.collection("tracks").orderBy("createdAt", "desc").limit(500).get();
  const tracks = [];
  const stale = Date.now() - LIMITS.pendingTtlMs;
  for (const doc of snap.docs) {
    const t = doc.data();
    if (t.status === "ready") { tracks.push(toPublicTrack(doc.id, t)); continue; }
    if (Date.parse(t.createdAt || 0) < stale) {
      await ctx.bucket.file(t.path).delete({ ignoreNotFound: true }).catch(() => {});
      await ctx.db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists || fresh.data().status === "ready") return;
        tx.delete(doc.ref);
        tx.set(ctx.userRef, { pendingBytes: FieldValue.increment(-t.size) }, { merge: true });
        tx.set(ctx.totalsRef, { pendingBytes: FieldValue.increment(-t.size) }, { merge: true });
      }).catch(() => {});
    }
  }
  const usage = (await ctx.userRef.get()).data() || {};
  return json({ ok: true, tracks, usedBytes: Number(usage.usedBytes) || 0, quotaBytes: LIMITS.userQuotaBytes });
}
