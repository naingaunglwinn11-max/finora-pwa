import Dexie, { type Table } from "dexie";
import type { Account, Category, FinanceTransaction, Settings } from "../types/finance";
import { defaultAccounts, defaultExpenseCategories, defaultIncomeCategories, defaultSettings } from "./schema";

class FinoraDatabase extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<FinanceTransaction, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("finoraDB");
    this.version(1).stores({
      accounts: "id, systemIdentifier, name, isActive",
      categories: "id, type, name",
      transactions: "id, type, date, accountId, destinationAccountId, categoryId, createdAt, updatedAt",
      settings: "id"
    });
  }
}

export const db = new FinoraDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.transaction("rw", db.accounts, db.categories, db.settings, async () => {
    for (const account of defaultAccounts) {
      const existing = await db.accounts.get(account.id);
      if (!existing) await db.accounts.put({ ...account, createdAt: new Date().toISOString() });
    }

    for (const category of [...defaultExpenseCategories, ...defaultIncomeCategories]) {
      const existing = await db.categories.get(category.id);
      if (!existing) await db.categories.put({ ...category, createdAt: new Date().toISOString() });
    }

    const settings = await db.settings.get("settings");
    if (!settings) await db.settings.put(defaultSettings);
  });
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? defaultSettings;
}
