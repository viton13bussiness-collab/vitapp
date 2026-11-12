import { validateMutationRequest } from "@/lib/http-security";
import { claimSeat } from "@/lib/rtc-cinema.mjs";
import { error, requireCaller } from "../_shared";
import { cinemaTransaction, readJson } from "../_cinema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Take a seat ({seat: "R2S5"}) or stand up ({seat: null}). One seat per person, checked in a transaction. */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 256 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const b = await readJson(request);
  if (!b) return error("INVALID_REQUEST", 400);
  return cinemaTransaction(state, (room) => claimSeat(room, state.user, b.seat ?? null));
}
