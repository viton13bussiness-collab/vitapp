import { NextResponse } from "next/server";
import { loadThreadContext } from "@/lib/firebase/dm-threads";
import { withNoStore } from "@/lib/http-security";
import {
  attachmentKind,
  isValidDocumentId,
  parseByteRange,
  sanitizeAttachmentName,
} from "@/lib/dm-model.mjs";
import { decryptAccountBytes, decryptAccountMessage } from "@/lib/dm-account-crypto.mjs";

export const runtime = "nodejs";

const error = (code, status) =>
  withNoStore(NextResponse.json({ ok: false, code }, { status }));

/** RFC 5987, so non-Latin file names survive the round trip. */
function contentDisposition(name, inline) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Serve one attachment back to a participant. Bytes are reassembled from their
 * Firestore chunks and decrypted per request; only media (photos, voice and
 * video notes) may render inline, and even those are served sandboxed and
 * same-origin only.
 */
export async function GET(request, context) {
  const state = await loadThreadContext(context, {
    rateScope: "dm-download",
    rateLimit: 400,
  });
  if (state.error) return error(state.error.code, state.error.status);

  const { attachmentId } = await context.params;
  if (!isValidDocumentId(attachmentId)) return error("INVALID_ATTACHMENT", 400);

  const attachmentRef = state.threadRef.collection("attachments").doc(String(attachmentId));
  const snapshot = await attachmentRef.get();
  const attachment = snapshot.data() || {};

  // An upload that has not been sent yet belongs to its author alone.
  const readable =
    snapshot.exists &&
    (attachment.status === "attached" || attachment.ownerId === state.user.id);
  if (!readable) return error("ATTACHMENT_NOT_FOUND", 404);

  const kind = attachmentKind(attachment.type);
  if (!kind) return error("UNSUPPORTED_FILE_TYPE", 415);

  const chunks = await attachmentRef.collection("chunks").orderBy("index").get();
  if (chunks.size !== Number(attachment.chunkCount || 0)) {
    return error("ATTACHMENT_INCOMPLETE", 410);
  }

  let bytes;
  try {
    const ciphertext = Buffer.concat(
      chunks.docs.map((doc) => Buffer.from(doc.data()?.bytes || []))
    );
    bytes = decryptAccountBytes(attachment, ciphertext);
  } catch {
    return error("ATTACHMENT_UNREADABLE", 500);
  }

  const name = sanitizeAttachmentName(
    (() => {
      try {
        return decryptAccountMessage(attachment.name);
      } catch {
        return "";
      }
    })()
  );
  const inline =
    (kind === "image" || kind === "voice" || kind === "video") &&
    request.nextUrl.searchParams.get("download") !== "1";

  const headers = {
    "Content-Type": attachment.type,
    "Content-Disposition": contentDisposition(name, inline),
    // Private media: the browser may keep it for the session so scrolling a
    // conversation does not re-fetch photos, but no shared cache may store it.
    "Cache-Control": "private, max-age=900, must-revalidate",
    // Audio elements ask for ranges before they will play, and Safari refuses
    // sources that cannot serve them.
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  };

  const range = parseByteRange(request.headers.get("range"), bytes.length);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  }
  if (range) {
    const slice = bytes.subarray(range.start, range.end + 1);
    return new NextResponse(slice, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(slice.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
      },
    });
  }

  return new NextResponse(bytes, {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
