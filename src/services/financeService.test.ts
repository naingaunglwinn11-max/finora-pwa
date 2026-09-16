import { describe, expect, it } from "vitest";
import type { Account, Category, FinanceTransaction } from "../types/finance";
import {
  calculateAccountBalance,
  calculateTotalBalance,
  getMonthlyExpenses,
  getMonthlyIncome,
  getMonthlyNet,
  getTransactionsByAccount,
  validateAvailableBalance
} from "./financeService";
import { validateBackup } from "./backupService";
import { formatTransactionTime, transactionDateKey } from "../utils/dates";

const accounts: Account[] = [
  { id: "cash", systemIdentifier: "cash", name: "Cash", type: "cash", icon: "cash", createdAt: "2026-09-01", isActive: true },
  { id: "kbzpay", systemIdentifier: "kbzpay", name: "KBZPay", type: "mobileWallet", icon: "kbzpay", createdAt: "2026-09-01", isActive: true }
];

const categories: Category[] = [
  { id: "salary", name: "Salary", type: "income", icon: "paycheck", createdAt: "2026-09-01", isDefault: true },
  { id: "food", name: "Food", type: "expense", icon: "fork", createdAt: "2026-09-01", isDefault: true }
];

function tx(partial: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: partial.id ?? crypto.randomUUID(),
    type: partial.type ?? "expense",
    amount: partial.amount ?? 0,
    accountId: partial.accountId ?? "cash",
    destinationAccountId: partial.destinationAccountId,
    categoryId: partial.categoryId,
    date: partial.date ?? "2026-09-16",
    transactionDateTime: partial.transactionDateTime,
    note: partial.note ?? "",
    createdAt: partial.createdAt ?? "2026-09-16T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-09-16T00:00:00.000Z"
  };
}

describe("financeService", () => {
  it("fresh accounts start at zero with no automatic opening transaction", () => {
    expect(calculateAccountBalance("cash", [])).toBe(0);
    expect(calculateAccountBalance("kbzpay", [])).toBe(0);
    expect(calculateTotalBalance(accounts, [])).toBe(0);
  });

  it("income increases Cash and KBZPay", () => {
    const transactions = [
      tx({ type: "income", amount: 100_000, accountId: "cash" }),
      tx({ type: "income", amount: 200_000, accountId: "kbzpay" })
    ];
    expect(calculateAccountBalance("cash", transactions)).toBe(100_000);
    expect(calculateAccountBalance("kbzpay", transactions)).toBe(200_000);
  });

  it("expense decreases Cash and KBZPay", () => {
    const transactions = [
      tx({ type: "income", amount: 100_000, accountId: "cash" }),
      tx({ type: "expense", amount: 30_000, accountId: "cash" }),
      tx({ type: "income", amount: 200_000, accountId: "kbzpay" }),
      tx({ type: "expense", amount: 40_000, accountId: "kbzpay" })
    ];
    expect(calculateAccountBalance("cash", transactions)).toBe(70_000);
    expect(calculateAccountBalance("kbzpay", transactions)).toBe(160_000);
  });

  it("transfer decreases source, increases destination, and does not change total", () => {
    const before = [
      tx({ type: "openingBalance", amount: 500_000, accountId: "cash" }),
      tx({ type: "openingBalance", amount: 300_000, accountId: "kbzpay" })
    ];
    const after = [...before, tx({ type: "transfer", amount: 100_000, accountId: "cash", destinationAccountId: "kbzpay" })];
    expect(calculateAccountBalance("cash", after)).toBe(400_000);
    expect(calculateAccountBalance("kbzpay", after)).toBe(400_000);
    expect(calculateTotalBalance(accounts, after)).toBe(calculateTotalBalance(accounts, before));
  });

  it("transfer is not counted as monthly income or expense", () => {
    const transactions = [
      tx({ type: "income", amount: 100_000, accountId: "cash" }),
      tx({ type: "expense", amount: 15_000, accountId: "kbzpay" }),
      tx({ type: "transfer", amount: 200_000, accountId: "cash", destinationAccountId: "kbzpay" })
    ];
    expect(getMonthlyIncome(transactions, "2026-09")).toBe(100_000);
    expect(getMonthlyExpenses(transactions, "2026-09")).toBe(15_000);
    expect(getMonthlyNet(transactions, "2026-09")).toBe(85_000);
  });

  it("legacy opening balance affects balance only, not monthly income or net", () => {
    const transactions = [
      tx({ type: "openingBalance", amount: 100_000, accountId: "cash" }),
      tx({ type: "openingBalance", amount: 200_000, accountId: "kbzpay" })
    ];
    expect(calculateAccountBalance("cash", transactions)).toBe(100_000);
    expect(calculateAccountBalance("kbzpay", transactions)).toBe(200_000);
    expect(calculateTotalBalance(accounts, transactions)).toBe(300_000);
    expect(getMonthlyIncome(transactions, "2026-09")).toBe(0);
    expect(getMonthlyNet(transactions, "2026-09")).toBe(0);
  });

  it("rejects expenses and transfers greater than available balance", () => {
    const transactions = [
      tx({ type: "income", amount: 50_000, accountId: "cash" })
    ];
    const accountNames = { cash: "Cash", kbzpay: "KBZPay" } as const;
    expect(validateAvailableBalance(tx({ type: "expense", amount: 100_000, accountId: "cash" }), transactions, accountNames)).toBe("Cash only has 50,000 MMK available.");
    expect(validateAvailableBalance(tx({ type: "transfer", amount: 100_000, accountId: "cash", destinationAccountId: "kbzpay" }), transactions, accountNames)).toBe("Cash only has 50,000 MMK available.");
    expect(validateAvailableBalance(tx({ type: "income", amount: 1_000_000, accountId: "cash" }), transactions, accountNames)).toBeNull();
  });

  it("delete and edit recalculate through source transactions", () => {
    const original = [
      tx({ id: "opening", type: "openingBalance", amount: 500_000, accountId: "cash" }),
      tx({ id: "lunch", type: "expense", amount: 15_000, accountId: "cash" })
    ];
    const deleted = original.filter((transaction) => transaction.id !== "lunch");
    const edited = original.map((transaction) => transaction.id === "lunch" ? { ...transaction, amount: 20_000 } : transaction);
    expect(calculateAccountBalance("cash", deleted)).toBe(500_000);
    expect(calculateAccountBalance("cash", edited)).toBe(480_000);
  });

  it("monthly filtering only uses matching date keys", () => {
    const transactions = [
      tx({ type: "income", amount: 50_000, date: "2026-08-31" }),
      tx({ type: "income", amount: 100_000, date: "2026-09-01" }),
      tx({ type: "expense", amount: 20_000, date: "2026-09-30" })
    ];
    expect(getMonthlyIncome(transactions, "2026-09")).toBe(100_000);
    expect(getMonthlyExpenses(transactions, "2026-09")).toBe(20_000);
  });

  it("monthly filtering uses transactionDateTime when present", () => {
    const transactions = [
      tx({ type: "income", amount: 100_000, date: "2026-08-31", transactionDateTime: "2026-09-01T03:10" })
    ];
    expect(getMonthlyIncome(transactions, "2026-09")).toBe(100_000);
    expect(transactionDateKey(transactions[0])).toBe("2026-09-01");
    expect(formatTransactionTime(transactions[0])).toBe("3:10 AM");
  });

  it("gets account transaction history for both transfer sides", () => {
    const transfer = tx({ type: "transfer", amount: 100_000, accountId: "cash", destinationAccountId: "kbzpay" });
    expect(getTransactionsByAccount("cash", [transfer])).toHaveLength(1);
    expect(getTransactionsByAccount("kbzpay", [transfer])).toHaveLength(1);
  });
});

describe("backupService", () => {
  it("validates backup export shape", () => {
    const backup = validateBackup({
      backupVersion: 1,
      createdAt: "2026-09-16T00:00:00.000Z",
      accounts,
      categories,
      transactions: [tx({ type: "income", amount: 100_000 })],
      settings: { id: "settings", onboardingCompleted: true, theme: "system" }
    });
    expect(backup.transactions).toHaveLength(1);
  });

  it("rejects invalid restore files before replacement", () => {
    expect(() => validateBackup({ backupVersion: 1, accounts: [], categories: [], transactions: [], settings: {} })).toThrow();
  });
});
