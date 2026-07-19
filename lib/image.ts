// Resize + compress an image file in the browser and return a data URL small
// enough to store as its own Firestore document — each photo gets its own
// document (docs are capped at 1 MiB), see MAX_PHOTO_BYTES in lib/projects.ts.
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1400,
  maxBytes = 850 * 1024
): Promise<string> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = sourceUrl;
  });

  let dim = maxDim;
  let out = "";

  // Try progressively smaller dimensions (each paired with a quality ladder)
  // until the encoded size fits the budget. Shrinking dimensions matters as
  // much as quality here — a detailed photo often can't hit a tight byte
  // budget through JPEG quality alone without going noticeably blocky.
  for (let attempt = 0; attempt < 7; attempt++) {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.85;
    out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > maxBytes && quality > 0.35) {
      quality -= 0.1;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    if (out.length <= maxBytes) return out;
    dim = Math.round(dim * 0.75);
  }

  // Best effort: return the smallest version we could produce even if it's
  // still slightly over budget — the caller checks the real total before
  // saving and will surface a clear message rather than a raw Firestore error.
  return out;
}
