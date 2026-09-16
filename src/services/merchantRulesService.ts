import { db } from "../db/db";
import type { Category } from "../types/finance";
import { createId } from "../utils/ids";
import { normalizeMerchantName, suggestCategoryIdForMerchant } from "./kbzpayReceiptParser";

export async function getMerchantCategorySuggestion(merchant: string | undefined, categories: Category[], type: "income" | "expense", note?: string): Promise<string> {
  const suggestionText = [merchant, note].filter(Boolean).join(" ");
  if (!merchant || type !== "expense") return suggestCategoryIdForMerchant(suggestionText, categories, type);
  const normalized = normalizeMerchantName(merchant);
  const rule = await db.merchantRules.where("normalizedMerchant").equals(normalized).first();
  return rule?.categoryId ?? suggestCategoryIdForMerchant(suggestionText, categories, type);
}

export async function rememberMerchantCategory(merchant: string | undefined, categoryId: string): Promise<void> {
  const normalized = normalizeMerchantName(merchant ?? "");
  if (!normalized || !categoryId) return;
  const existing = await db.merchantRules.where("normalizedMerchant").equals(normalized).first();
  const now = new Date().toISOString();
  await db.merchantRules.put({
    id: existing?.id ?? createId(),
    normalizedMerchant: normalized,
    categoryId,
    lastUsedAt: now,
    usageCount: (existing?.usageCount ?? 0) + 1
  });
}
