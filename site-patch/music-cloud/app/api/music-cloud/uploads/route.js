import { FieldValue } from "firebase-admin/firestore";
import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { validateMutationRequest } from "@/lib/http-security";
import { LIMITS, checkRoom, normalizeUpload, objectPath } from "@/lib/music-cloud.mjs";
import { context, error, json } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start an upload: reserve room (the member's quota and the project's cap) in one transaction, create the
 * track as «pending» and hand back a resumable upload URL for exactly this object. The bytes go straight to
 * Storage; «complete» then checks what arrived and moves the reservation into usage.
 */
export async function POST(request) {
  const requestError = validateMutationRequest(request, { maxBytes: 4096 });
  if (requestError) return error(requestError.code, requestError.status);
  const ctx = await context();
  if (ctx.response) return ctx.response;

  const budget = await consumeRateLimit({ scope: "music-cloud-upload", key: ctx.user.id, limit: LIMITS.uploadsPerDay, windowMs: 24 * 60 * 60 * 1000 }).catch(() => null);
  if (!budget) return error("RATE_LIMIT_UNAVAILABLE", 503);
  if (!budget.allowed) return error("TOO_MANY_REQUESTS", 429);

  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const norm = normalizeUpload(payload);
  if (norm.error) return error(norm.error, norm.error === "FILE_TOO_LARGE" ? 413 : 400);
  const meta = norm.value;

  const ref = ctx.userRef.collection("tracks").doc();
  const path = objectPath(ctx.user.id, ref.id, meta.type);
  const iso = new Date().toISOString();
  try {
    await ctx.db.runTransaction(async (tx) => {
      const [u, t] = await Promise.all([tx.get(ctx.userRef), tx.get(ctx.totalsRef)]);
      const full = checkRoom({ user: u.data() || {}, totals: t.data() || {}, size: meta.size });
      if (full) throw Object.assign(new Error(full), { code: full });
      tx.set(ref, { ...meta, path, status: "pending", createdAt: iso });
      tx.set(ctx.userRef, { pendingBytes: FieldValue.increment(meta.size), updatedAt: iso }, { merge: true });
      tx.set(ctx.totalsRef, { pendingBytes: FieldValue.increment(meta.size) }, { merge: true });
    });
  } catch (e) {
    if (e?.code === "QUOTA_EXCEEDED" || e?.code === "CLOUD_FULL") return error(e.code, 507);
    return error("MUSIC_CLOUD_UNAVAILABLE", 503);
  }

  try {
    const [uploadUrl] = await ctx.bucket.file(path).createResumableUpload({
      metadata: { contentType: meta.type, metadata: { owner: ctx.user.id, track: ref.id } },
    });
    return json({ ok: true, track: { id: ref.id }, uploadUrl }, { status: 201 });
  } catch {
    await ctx.db.runTransaction(async (tx) => {
      tx.delete(ref);
      tx.set(ctx.userRef, { pendingBytes: FieldValue.increment(-meta.size) }, { merge: true });
      tx.set(ctx.totalsRef, { pendingBytes: FieldValue.increment(-meta.size) }, { merge: true });
    }).catch(() => {});
    return error("MUSIC_CLOUD_UNAVAILABLE", 503);
  }
}
