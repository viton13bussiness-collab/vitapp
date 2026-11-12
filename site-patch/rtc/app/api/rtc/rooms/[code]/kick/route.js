import { validateMutationRequest } from "@/lib/http-security";
import { isValidMemberId } from "@/lib/rtc-rooms.mjs";
import { kick } from "@/lib/rtc-cinema.mjs";
import { error, requireCaller } from "../_shared";
import { cinemaTransaction, readJson } from "../_cinema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The host sends a viewer out of the hall ({uid}); they lose their seat and can't come back with that ticket. */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 256 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const b = await readJson(request);
  const uid = String(b?.uid || "");
  if (!isValidMemberId(uid) || uid === state.user.id) return error("INVALID_REQUEST", 400);
  return cinemaTransaction(state, (room) => kick(room, uid), { hostOnly: true });
}
