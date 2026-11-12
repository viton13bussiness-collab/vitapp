"use client";

/* Attachment sizes were formatted with a two-arm ternary, so /fr got
   Spanish grouping and English unit suffixes. */
const ATTACHMENT_INTL = { en: "en-GB", ru: "ru-RU", es: "es-ES", fr: "fr-FR" };
const BYTE_UNITS = {
  en: { MB: "MB", KB: "KB", B: "B" },
  ru: { MB: "МБ", KB: "КБ", B: "Б" },
  es: { MB: "MB", KB: "KB", B: "B" },
  fr: { MB: "Mo", KB: "Ko", B: "o" },
};

// Browser half of direct-message attachments.
//
// Photos leave the device already resized: a phone camera file is several
// megabytes of detail nobody reads inside a chat bubble, and the conversation
// stores every byte encrypted, so the smaller file is both faster and cheaper.
// Documents are passed through untouched.
//
// The caps here mirror lib/dm-model.mjs, which enforces them server-side —
// tests/dm-attachments.test.js keeps the two files honest.

export const DM_MAX_ATTACHMENTS = 4;
export const DM_MAX_ATTACHMENT_BYTES = 4_000_000;

export const DM_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const DM_VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
export const DM_FILE_TYPES = ["application/pdf", "text/plain"];
/** Video notes come only from the recorder (the VITON13 app), never from the file picker. */
export const DM_VIDEO_TYPES = ["video/webm", "video/mp4"];
export const DM_ACCEPT = [...DM_IMAGE_TYPES, ...DM_VOICE_TYPES, ...DM_FILE_TYPES].join(",");

/** Long edge a stored photo is reduced to, and the size that triggers it. */
const IMAGE_MAX_EDGE = 1600;
const IMAGE_RECOMPRESS_ABOVE_BYTES = 900_000;

export function attachmentKindOf(type) {
  const mime = String(type || "").toLowerCase().split(";")[0].trim();
  if (DM_IMAGE_TYPES.includes(mime)) return "image";
  if (DM_VOICE_TYPES.includes(mime)) return "voice";
  if (DM_FILE_TYPES.includes(mime)) return "file";
  if (DM_VIDEO_TYPES.includes(mime)) return "video";
  return "";
}

export function formatBytes(bytes, locale = "en") {
  const value = Number(bytes) || 0;
  const units = value >= 1_000_000 ? "MB" : value >= 1_000 ? "KB" : "B";
  const scaled = units === "MB" ? value / 1_000_000 : units === "KB" ? value / 1_000 : value;
  const intl = ATTACHMENT_INTL[locale] || ATTACHMENT_INTL.en;
  const formatted = new Intl.NumberFormat(intl, {
    maximumFractionDigits: units === "B" ? 0 : scaled < 10 ? 1 : 0,
  }).format(scaled);
  const suffix = (BYTE_UNITS[locale] || BYTE_UNITS.en)[units];
  return `${formatted} ${suffix}`;
}

function renameForType(name, type) {
  const base = String(name || "photo").replace(/\.[^.]+$/, "") || "photo";
  const extension = type === "image/webp" ? "webp" : "jpg";
  return `${base}.${extension}`;
}

async function readImageSize(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height, bitmap };
      return size;
    } catch {
      /* fall through to the <img> probe */
    }
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight, bitmap: null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, bitmap: null });
    };
    image.src = url;
  });
}

async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Validate one picked file and, for oversized photos, produce a resized copy.
 * Returns a staged attachment: the bytes to upload plus what the composer needs
 * to draw a preview.
 */
export async function prepareAttachment(file) {
  const kind = attachmentKindOf(file?.type);
  if (!kind) return { ok: false, code: "UNSUPPORTED_FILE_TYPE", name: file?.name || "" };

  if (kind !== "image") {
    if (file.size > DM_MAX_ATTACHMENT_BYTES) {
      return { ok: false, code: "FILE_TOO_LARGE", name: file.name };
    }
    return {
      ok: true,
      value: {
        file,
        name: file.name,
        type: attachmentKindOf(file.type) === "voice" ? file.type.split(";")[0].trim() : file.type,
        size: file.size,
        kind,
        width: 0,
        height: 0,
        previewUrl: "",
      },
    };
  }

  const measured = await readImageSize(file);
  const longEdge = Math.max(measured.width, measured.height);
  const oversized = longEdge > IMAGE_MAX_EDGE || file.size > IMAGE_RECOMPRESS_ABOVE_BYTES;
  // Animation would be flattened by a canvas pass, so GIFs are never resized.
  const resizable = oversized && longEdge > 0 && file.type !== "image/gif";

  let output = { file, width: measured.width, height: measured.height };

  if (resizable) {
    const scale = Math.min(1, IMAGE_MAX_EDGE / longEdge);
    const width = Math.max(1, Math.round(measured.width * scale));
    const height = Math.max(1, Math.round(measured.height * scale));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(measured.bitmap || (await createImageBitmap(file)), 0, 0, width, height);
      const blob =
        (await canvasToBlob(canvas, "image/webp", 0.86)) ||
        (await canvasToBlob(canvas, "image/jpeg", 0.86));
      if (blob && blob.size < file.size) {
        output = {
          file: new File([blob], renameForType(file.name, blob.type), { type: blob.type }),
          width,
          height,
        };
      }
    } catch {
      /* keep the original file: a resize is an optimisation, not a gate */
    }
  }

  measured.bitmap?.close?.();

  if (output.file.size > DM_MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE", name: file.name };
  }

  return {
    ok: true,
    value: {
      file: output.file,
      name: output.file.name,
      type: output.file.type,
      size: output.file.size,
      kind,
      width: output.width,
      height: output.height,
      previewUrl: URL.createObjectURL(output.file),
    },
  };
}

function bytesToBase64Url(buffer) {
  const view = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < view.length; offset += step) {
    binary += String.fromCharCode(...view.subarray(offset, offset + step));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Send one staged attachment; the id it returns is claimed by the message. */
export async function uploadAttachment(threadId, staged) {
  const data = bytesToBase64Url(await staged.file.arrayBuffer());
  const response = await fetch(`/api/messages/threads/${threadId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: staged.name,
      type: staged.type,
      size: staged.size,
      width: staged.width || 0,
      height: staged.height || 0,
      duration: staged.duration || 0,
      peaks: staged.peaks || [],
      data,
    }),
  }).catch(() => null);

  const payload = await response?.json().catch(() => null);
  if (!response?.ok || !payload?.ok) {
    return { ok: false, code: payload?.code || "UPLOAD_FAILED" };
  }
  return { ok: true, value: payload.attachment };
}

export function attachmentUrl(threadId, attachmentId, { download = false } = {}) {
  return `/api/messages/threads/${threadId}/attachments/${attachmentId}${download ? "?download=1" : ""}`;
}
