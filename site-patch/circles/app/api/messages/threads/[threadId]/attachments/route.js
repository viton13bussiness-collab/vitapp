import { NextResponse } from "next/server";
import { loadThreadContext } from "@/lib/firebase/dm-threads";
import { consumeRateLimit } from "@/lib/firebase/rate-limit";
import { validateMutationRequest, withNoStore } from "@/lib/http-security";
import {
  DM_ATTACHMENT_CHUNK_BYTES,
  DM_ATTACHMENT_TTL_MS,
  DM_MAX_ATTACHMENT_BYTES,
  DM_MAX_VIDEO_NOTES_PER_DAY,
  DM_MAX_VIDEO_SECONDS,
  DM_MAX_VOICE_SECONDS,
  DM_VOICE_PEAKS,
  matchesDeclaredType,
  validateAttachmentUpload,
} from "@/lib/dm-model.mjs";
import { encryptAccountBytes, encryptAccountMessage } from "@/lib/dm-account-crypto.mjs";

export const runtime = "nodejs";

const json = (payload, init) => withNoStore(NextResponse.json(payload, init));
const error = (code, status) => json({ ok: false, code }, { status });

/** base64url of the byte cap, plus room for the JSON envelope. */
const MAX_BODY_BYTES = Math.ceil((DM_MAX_ATTACHMENT_BYTES * 4) / 3) + 4_096;

function dimension(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 20_000 ? number : 0;
}

function duration(value, cap = DM_MAX_VOICE_SECONDS) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(cap, Math.round(seconds * 10) / 10);
}

/** The waveform is drawn from these, so clamp both length and range. */
function peaks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, DM_VOICE_PEAKS)
    .map((entry) => {
      const level = Number(entry);
      return Number.isFinite(level) ? Math.min(100, Math.max(0, Math.round(level))) : 0;
    });
}

/**
 * Upload one file into a conversation. The bytes are encrypted with the same
 * account key as message text and stored as Firestore chunks — the same shape
 * VIT MARKET uses for secure request packages, so no storage bucket is needed.
 *
 * An upload starts unattached and expires on its own; POSTing the message is
 * what claims it. A composer the member abandons leaves nothing behind.
 */
export async function POST(request, context) {
  const requestError = validateMutationRequest(request, { maxBytes: MAX_BODY_BYTES });
  if (requestError) return error(requestError.code, requestError.status);

  const state = await loadThreadContext(context, {
    rateScope: "dm-upload",
    rateLimit: 60,
  });
  if (state.error) return error(state.error.code, state.error.status);

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return error("INVALID_REQUEST", 400);
  }

  const encoded = String(payload?.data || "");
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > MAX_BODY_BYTES) {
    return error("INVALID_FILE", 400);
  }

  const descriptor = validateAttachmentUpload({
    name: payload?.name,
    type: payload?.type,
    size: payload?.size,
  });
  if (!descriptor.ok) return error(descriptor.code, descriptor.code === "FILE_TOO_LARGE" ? 413 : 400);

  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length !== descriptor.value.size) return error("INVALID_FILE_SIZE", 400);
  if (bytes.length > DM_MAX_ATTACHMENT_BYTES) return error("FILE_TOO_LARGE", 413);
  if (!matchesDeclaredType(descriptor.value.type, bytes)) {
    return error("FILE_TYPE_MISMATCH", 400);
  }

  // Video notes: a minute at most, and a per-member daily cap that keeps the
  // whole project inside the Firestore free tier.
  const isVideo = descriptor.value.kind === "video";
  if (isVideo) {
    const seconds = Number(payload?.duration);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > DM_MAX_VIDEO_SECONDS + 1) {
      return error("VIDEO_TOO_LONG", 400);
    }
    const quota = await consumeRateLimit({
      scope: "dm-video-note",
      key: state.user.id,
      limit: DM_MAX_VIDEO_NOTES_PER_DAY,
      windowMs: 24 * 60 * 60 * 1000,
    }).catch(() => ({ allowed: false, retryAfterSeconds: 60 }));
    if (!quota.allowed) return error("VIDEO_NOTES_PER_DAY", 429);
  }
  const mediaSeconds = duration(payload?.duration, isVideo ? DM_MAX_VIDEO_SECONDS : DM_MAX_VOICE_SECONDS);

  const sealed = encryptAccountBytes(bytes);
  const chunks = [];
  for (let offset = 0; offset < sealed.bytes.length; offset += DM_ATTACHMENT_CHUNK_BYTES) {
    chunks.push(sealed.bytes.subarray(offset, offset + DM_ATTACHMENT_CHUNK_BYTES));
  }

  const now = new Date();
  const attachmentRef = state.threadRef.collection("attachments").doc();
  const batch = state.db.batch();

  batch.set(attachmentRef, {
    ownerId: state.user.id,
    status: "pending",
    // The file name is member content, so it is sealed like message text.
    name: encryptAccountMessage(descriptor.value.name),
    type: descriptor.value.type,
    kind: descriptor.value.kind,
    size: descriptor.value.size,
    width: dimension(payload?.width),
    height: dimension(payload?.height),
    duration: mediaSeconds,
    peaks: peaks(payload?.peaks),
    encryptionVersion: sealed.encryptionVersion,
    encryptionIv: sealed.encryptionIv,
    encryptionTag: sealed.encryptionTag,
    chunkCount: chunks.length,
    byteLength: sealed.bytes.length,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DM_ATTACHMENT_TTL_MS),
  });

  chunks.forEach((chunk, index) => {
    batch.set(attachmentRef.collection("chunks").doc(String(index).padStart(3, "0")), {
      index,
      bytes: chunk,
    });
  });

  try {
    await batch.commit();
  } catch (commitError) {
    console.error("Direct message attachment storage failed", commitError);
    return error("ATTACHMENT_STORAGE_FAILED", 500);
  }

  return json(
    {
      ok: true,
      attachment: {
        id: attachmentRef.id,
        name: descriptor.value.name,
        type: descriptor.value.type,
        kind: descriptor.value.kind,
        size: descriptor.value.size,
        width: dimension(payload?.width),
        height: dimension(payload?.height),
        duration: mediaSeconds,
        peaks: peaks(payload?.peaks),
      },
    },
    { status: 201 }
  );
}
