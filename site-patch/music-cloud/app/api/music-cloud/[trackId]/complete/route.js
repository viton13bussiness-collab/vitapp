import { FieldValue } from "firebase-admin/firestore";
import { validateMutationRequest } from "@/lib/http-security";
import { AUDIO_TYPES, LIMITS, normalizeCover, toPublicTrack } from "@/lib/music-cloud.mjs";
import { context, error, json, ownTrack } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finish an upload: the object must exist, be no bigger than what was reserved and be audio.
 * The reservation becomes usage; a small cover (≤ 300 KB) may ride along and is kept on the track.
 */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: Math.ceil(LIMITS.coverBytes * 4 / 3) + 4096 });
  if (requestError) return error(requestError.code, requestError.status);
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const { trackId } = await params;
  const own = await ownTrack(ctx, trackId);
  if (own.response) return own.response;
  if (own.track.status === "ready") return json({ ok: true, track: toPublicTrack(trackId, own.track) });

  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const cover = normalizeCover(payload?.cover, payload?.coverType);
  if (cover.error) return error(cover.error, 400);

  let meta;
  try { [meta] = await ctx.bucket.file(own.track.path).getMetadata(); } catch { return error("UPLOAD_INCOMPLETE", 409); }
  const size = Number(meta?.size) || 0;
  const type = String(meta?.contentType || "").split(";")[0];
  if (!size || size > own.track.size || !AUDIO_TYPES[type]) {
    await ctx.bucket.file(own.track.path).delete({ ignoreNotFound: true }).catch(() => {});
    return error("UPLOAD_INCOMPLETE", 409);
  }

  const iso = new Date().toISOString();
  await ctx.db.runTransaction(async (tx) => {
    const fresh = await tx.get(own.ref);
    if (!fresh.exists || fresh.data().status === "ready") return;
    const reserved = Number(fresh.data().size) || 0;
    tx.update(own.ref, { status: "ready", size, readyAt: iso, ...(cover.value ? { cover: cover.value.data, coverType: cover.value.type } : {}) });
    tx.set(ctx.userRef, { pendingBytes: FieldValue.increment(-reserved), usedBytes: FieldValue.increment(size), count: FieldValue.increment(1), updatedAt: iso }, { merge: true });
    tx.set(ctx.totalsRef, { pendingBytes: FieldValue.increment(-reserved), storedBytes: FieldValue.increment(size) }, { merge: true });
  });
  return json({ ok: true, track: toPublicTrack(trackId, { ...own.track, size, cover: cover.value?.data }) });
}
