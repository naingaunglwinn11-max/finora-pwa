import { describe, expect, it } from "vitest";
import type { Account, Category, FinanceTransaction } from "../types/finance";
import {
  getAccountSpendingBreakdown,
  getAverageDailySpend,
  getLargestExpense,
  getMonthlyExpenseTotal,
  getMonthlyIncomeTotal,
  getMostUsedAccount,
  getNetForMonth,
  getPreviousPeriodComparison,
  getTopExpenseCategory
} from "./insightsService";

const accounts: Account[] = [
  { id: "cash", systemIdentifier: "cash", name: "Cash", type: "cash", icon: "cash", createdAt: "2026-09-01", isActive: true },
  { id: "kbzpay", systemIdentifier: "kbzpay", name: "KBZPay", type: "mobileWallet", icon: "kbzpay", createdAt: "2026-09-01", isActive: true }
];

const categories: Category[] = [
  { id: "salary", name: "Salary", type: "income", icon: "paycheck", createdAt: "2026-09-01", isDefault: true },
  { id: "food", name: "Food", type: "expense", icon: "fork", createdAt: "2026-09-01", isDefault: true },
  { id: "shopping", name: "Shopping", type: "expense", icon: "bag", createdAt: "2026-09-01", isDefault: true },
  { id: "transport", name: "Transport", type: "expense", icon: "car", createdAt: "2026-09-01", isDefault: true },
  { id: "bills", name: "Bills", type: "expense", icon: "receipt", createdAt: "2026-09-01", isDefault: true },
  { id: "entertainment", name: "Entertainment", type: "expense", icon: "play", createdAt: "2026-09-01", isDefault: true }
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
    transactionDateTime: partial.transactionDateTime ?? `${partial.date ?? "2026-09-16"}T12:00`,
    note: partial.note ?? "",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z"
  };
}

describe("insightsService", () => {
  const dataset = [
    tx({ type: "income", amount: 2_000_000, accountId: "kbzpay", categoryId: "salary" }),
    tx({ amount: 180_000, accountId: "kbzpay", categoryId: "food" }),
    tx({ amount: 150_000, accountId: "kbzpay", categoryId: "shopping" }),
    tx({ amount: 90_000, accountId: "cash", categoryId: "transport" }),
    tx({ amount: 80_000, accountId: "cash", categoryId: "bills" }),
    tx({ amount: 20_000, accountId: "kbzpay", categoryId: "entertainment" })
  ];

  it("calculates the controlled insights dataset", () => {
    expect(getMonthlyExpenseTotal(dataset, "2026-09")).toBe(520_000);
    expect(getTopExpenseCategory(dataset, categories, "2026-09")).toMatchObject({ category: "Food", amount: 180_000 });
    expect(getAccountSpendingBreakdown(dataset, accounts, "2026-09").map((item) => [item.account.id, item.amount, item.percent])).toEqual([
      ["cash", 170_000, 33],
      ["kbzpay", 350_000, 67]
    ]);
    expect(getMostUsedAccount(dataset, accounts, "2026-09")).toMatchObject({ amount: 350_000, percent: 67 });
    expect(getNetForMonth(dataset, "2026-09")).toBe(1_480_000);
    expect(getLargestExpense(dataset, categories, "2026-09")).toMatchObject({ category: "Food" });
  });

  it("excludes transfers and opening balances from insights", () => {
    const rows = [
      tx({ type: "openingBalance", amount: 1_500_000, accountId: "cash" }),
      tx({ type: "transfer", amount: 100_000, accountId: "cash", destinationAccountId: "kbzpay" }),
      tx({ type: "expense", amount: 10_000, accountId: "cash", categoryId: "food" })
    ];
    expect(getMonthlyIncomeTotal(rows, "2026-09")).toBe(0);
    expect(getMonthlyExpenseTotal(rows, "2026-09")).toBe(10_000);
    expect(getNetForMonth(rows, "2026-09")).toBe(-10_000);
  });

  it("handles previous comparable period and zero previous period", () => {
    const rows = [
      tx({ amount: 400_000, date: "2026-09-16", transactionDateTime: "2026-09-16T12:00" }),
      tx({ amount: 500_000, date: "2026-08-16", transactionDateTime: "2026-08-16T12:00" })
    ];
    expect(getPreviousPeriodComparison(rows, "2026-09", new Date(2026, 8, 16))).toMatchObject({ percentChange: 20, direction: "less" });
    expect(getPreviousPeriodComparison([rows[0]], "2026-09", new Date(2026, 8, 16))).toMatchObject({ percentChange: null, direction: "none" });
  });

  it("calculates average daily spend using elapsed days for current month", () => {
    const rows = [tx({ amount: 160_000, date: "2026-09-16", transactionDateTime: "2026-09-16T12:00" })];
    expect(getAverageDailySpend(rows, "2026-09", new Date(2026, 8, 16))).toBe(10_000);
  });
});
