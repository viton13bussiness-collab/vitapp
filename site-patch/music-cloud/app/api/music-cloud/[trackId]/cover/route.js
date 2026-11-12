import { context, error, json, ownTrack } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The track's small cover, as base64 — it lives on the track document, so it costs no Storage download. */
export async function GET(request, { params }) {
  const ctx = await context();
  if (ctx.response) return ctx.response;
  const { trackId } = await params;
  const own = await ownTrack(ctx, trackId);
  if (own.response) return own.response;
  if (!own.track.cover) return error("NOT_FOUND", 404);
  return json({ ok: true, type: own.track.coverType || "image/jpeg", data: own.track.cover });
}
