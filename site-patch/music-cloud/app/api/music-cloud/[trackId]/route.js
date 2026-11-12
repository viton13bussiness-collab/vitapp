import { FieldValue } from "firebase-admin/firestore";
import { validateMutationRequest } from "@/lib/http-security";
import { normalizeEdit, toPublicTrack } from "@/lib/music-cloud.mjs";
import { context, error, json, ownTrack } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rename a track: title, artist, album. */
export async function PATCH(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 2048 });
  if (requestError) return error(requestError.code, requestError.status);
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const { trackId } = await params;
  const own = await ownTrack(ctx, trackId);
  if (own.response) return own.response;
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const edit = normalizeEdit(payload);
  if (edit.error) return error(edit.error, 400);
  if (Object.keys(edit.value).length) await own.ref.update(edit.value);
  return json({ ok: true, track: toPublicTrack(trackId, { ...own.track, ...edit.value }) });
}

/** Delete a track from the cloud: the object, the document and its share of the usage. */
export async function DELETE(request, { params }) {
  const requestError = validateMutationRequest(request, { requireJson: false });
  if (requestError) return error(requestError.code, requestError.status);
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const { trackId } = await params;
  const own = await ownTrack(ctx, trackId);
  if (own.response) return own.response;
  await ctx.bucket.file(own.track.path).delete({ ignoreNotFound: true }).catch(() => {});
  await ctx.db.runTransaction(async (tx) => {
    const fresh = await tx.get(own.ref);
    if (!fresh.exists) return;
    const t = fresh.data(), size = Number(t.size) || 0, ready = t.status === "ready";
    tx.delete(own.ref);
    tx.set(ctx.userRef, ready ? { usedBytes: FieldValue.increment(-size), count: FieldValue.increment(-1) } : { pendingBytes: FieldValue.increment(-size) }, { merge: true });
    tx.set(ctx.totalsRef, ready ? { storedBytes: FieldValue.increment(-size) } : { pendingBytes: FieldValue.increment(-size) }, { merge: true });
  });
  return json({ ok: true });
}
