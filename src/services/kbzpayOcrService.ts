import { parseKBZPayReceipt, type KBZPayReceiptResult } from "./kbzpayReceiptParser";

export async function readKBZPayReceipt(file: File): Promise<KBZPayReceiptResult> {
  const prepared = await prepareImage(file);
  try {
    const { recognize } = await import("tesseract.js");
    const result = await recognize(prepared, "eng");
    const parsed = parseKBZPayReceipt(result.data.text);
    if (!looksLikeKBZPayReceipt(parsed)) {
      throw new Error("We couldn't find a KBZPay transaction in this image.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("KBZPay transaction")) throw error;
    throw new Error("Receipt scanning is unavailable right now. You can still add this transaction manually.");
  }
}

function looksLikeKBZPayReceipt(result: KBZPayReceiptResult): boolean {
  const text = result.rawText ?? "";
  const hasKBZCue = /kbz|kbzpay/i.test(text);
  const hasTransactionData = Boolean(result.amount || result.transactionReference || result.merchant);
  return hasKBZCue || hasTransactionData;
}

async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png", 0.92));
}
