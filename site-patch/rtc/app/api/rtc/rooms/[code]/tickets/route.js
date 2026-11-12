import { validateMutationRequest } from "@/lib/http-security";
import { issueTickets, revokeTicket } from "@/lib/rtc-cinema.mjs";
import { error, requireCaller } from "../_shared";
import { cinemaTransaction, readJson } from "../_cinema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The host issues tickets: {count, uses} shareable, or {seats: ["R2S5", …]} one per seat. */
export async function POST(request, { params }) {
  const requestError = validateMutationRequest(request, { maxBytes: 2048 });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const b = await readJson(request);
  if (!b) return error("INVALID_REQUEST", 400);
  return cinemaTransaction(state, (room) => issueTickets(room, { count: b.count, seats: b.seats, uses: b.uses, label: b.label }), { hostOnly: true });
}

/** The host takes a ticket back (?t=KEY); whoever came in by it leaves the hall. */
export async function DELETE(request, { params }) {
  const requestError = validateMutationRequest(request, { requireJson: false });
  if (requestError) return error(requestError.code, requestError.status);
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const key = String(request.nextUrl.searchParams.get("t") || "").toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(key)) return error("TICKET_NOT_FOUND", 404);
  return cinemaTransaction(state, (room) => revokeTicket(room, key), { hostOnly: true });
}
