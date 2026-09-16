import { db, getSettings } from "../db/db";
import type { Account, Category, FinanceTransaction, FinoraBackup, MerchantRule, Settings } from "../types/finance";

export async function createBackup(): Promise<FinoraBackup> {
  return {
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    settings: await getSettings(),
    merchantRules: await db.merchantRules.toArray()
  };
}

export function validateBackup(value: unknown): FinoraBackup {
  if (!isRecord(value) || value.backupVersion !== 1) throw new Error("Unsupported backup file.");
  const backup = value as Partial<FinoraBackup>;
  if (!Array.isArray(backup.accounts) || !Array.isArray(backup.categories) || !Array.isArray(backup.transactions)) {
    throw new Error("Backup is missing required data.");
  }
  if (!backup.accounts.some((account) => isAccount(account) && account.id === "cash")) throw new Error("Backup is missing Cash.");
  if (!backup.accounts.some((account) => isAccount(account) && account.id === "kbzpay")) throw new Error("Backup is missing KBZPay.");
  if (!backup.transactions.every(isTransaction)) throw new Error("Backup contains invalid transactions.");
  if (backup.merchantRules && !backup.merchantRules.every(isMerchantRule)) throw new Error("Backup contains invalid merchant rules.");
  if (!backup.categories.every(isCategory)) throw new Error("Backup contains invalid categories.");
  if (!isSettings(backup.settings)) throw new Error("Backup contains invalid settings.");
  return backup as FinoraBackup;
}

export async function restoreBackup(backup: FinoraBackup): Promise<void> {
  validateBackup(backup);
  await db.transaction("rw", db.accounts, db.categories, db.transactions, db.merchantRules, db.settings, async () => {
    await db.accounts.clear();
    await db.categories.clear();
    await db.transactions.clear();
    await db.merchantRules.clear();
    await db.settings.clear();
    await db.accounts.bulkPut(backup.accounts);
    await db.categories.bulkPut(backup.categories);
    await db.transactions.bulkPut(backup.transactions);
    if (backup.merchantRules?.length) await db.merchantRules.bulkPut(backup.merchantRules);
    await db.settings.put({ ...backup.settings, id: "settings" });
  });
}

export function downloadFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccount(value: unknown): value is Account {
  return isRecord(value) && (value.id === "cash" || value.id === "kbzpay") && typeof value.name === "string";
}

function isCategory(value: unknown): value is Category {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && (value.type === "income" || value.type === "expense");
}

function isTransaction(value: unknown): value is FinanceTransaction {
  return isRecord(value)
    && typeof value.id === "string"
    && ["income", "expense", "transfer", "openingBalance"].includes(String(value.type))
    && typeof value.amount === "number"
    && Number.isSafeInteger(value.amount)
    && value.amount >= 0
    && (typeof value.transactionDateTime === "undefined" || typeof value.transactionDateTime === "string")
    && (value.accountId === "cash" || value.accountId === "kbzpay");
}

function isMerchantRule(value: unknown): value is MerchantRule {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.normalizedMerchant === "string"
    && typeof value.categoryId === "string"
    && typeof value.lastUsedAt === "string"
    && typeof value.usageCount === "number";
}

function isSettings(value: unknown): value is Settings {
  return isRecord(value) && value.id === "settings" && typeof value.onboardingCompleted === "boolean";
}
