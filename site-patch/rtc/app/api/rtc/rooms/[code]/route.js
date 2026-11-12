import { liveMembers, roomIsOpen, RTC_MAX_MEMBERS } from "@/lib/rtc-rooms.mjs";
import { error, json, requireCaller } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the lobby shows before joining: the title and who is already inside. */
export async function GET(_request, { params }) {
  const state = await requireCaller(params);
  if (state.error) return state.error;
  const snap = await state.ref.get();
  const room = snap.exists ? snap.data() : null;
  if (!roomIsOpen(room)) return error("ROOM_NOT_FOUND", 404);
  const members = liveMembers(room);
  return json({ ok: true, room: { code: state.code, title: room.title || "", hostId: room.hostId, members, full: members.length >= RTC_MAX_MEMBERS } });
}
