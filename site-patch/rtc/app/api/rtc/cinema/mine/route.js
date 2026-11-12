import { NextResponse } from "next/server";
import { getFirebaseAdminDb, hasFirebaseAdminEnv } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/server-auth";
import { withNoStore } from "@/lib/http-security";
import { ROOMS, roomIsOpen } from "@/lib/rtc-rooms.mjs";
import { publicScreening } from "@/lib/rtc-cinema.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (payload, init) => withNoStore(NextResponse.json(payload, init));

/** Screenings I host and screenings I have a ticket to, soonest first. Single-field queries: no composite index. */
export async function GET() {
  if (!hasFirebaseAdminEnv()) return json({ ok: false, code: "RTC_NOT_CONFIGURED" }, { status: 503 });
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || user.status === "Suspended") return json({ ok: false, code: "VITON_ID_REQUIRED" }, { status: 401 });
  const db = getFirebaseAdminDb();
  const [hosted, guest] = await Promise.all([
    db.collection(ROOMS).where("hostId", "==", user.id).limit(40).get(),
    db.collection(ROOMS).where("admittedIds", "array-contains", user.id).limit(40).get(),
  ]);
  const pick = (snap) => snap.docs.map((d) => d.data()).filter((r) => r.kind === "cinema" && roomIsOpen(r)).map((r) => publicScreening(r, user.id))
    .sort((a, b) => String(a.screening?.startsAt).localeCompare(String(b.screening?.startsAt)));
  return json({ ok: true, hosting: pick(hosted), tickets: pick(guest).filter((r) => r.hostId !== user.id) });
}
