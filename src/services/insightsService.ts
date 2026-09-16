import type { Account, AccountId, Category, FinanceTransaction } from "../types/finance";
import { monthKey, transactionDateKey } from "../utils/dates";

export type InsightComparison = {
  percentChange: number | null;
  direction: "more" | "less" | "same" | "none";
  message: string;
};

export function getMonthlyExpenseTotal(transactions: FinanceTransaction[], month: string): number {
  return expenseTransactionsForMonth(transactions, month).reduce((total, transaction) => total + transaction.amount, 0);
}

export function getMonthlyIncomeTotal(transactions: FinanceTransaction[], month: string): number {
  return transactions
    .filter((transaction) => transaction.type === "income" && transactionDateKey(transaction).startsWith(month))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function getTopExpenseCategory(transactions: FinanceTransaction[], categories: Category[], month: string) {
  return getCategoryBreakdown(transactions, categories, month)[0] ?? null;
}

export function getAccountSpendingBreakdown(transactions: FinanceTransaction[], accounts: Account[], month: string) {
  const expenses = expenseTransactionsForMonth(transactions, month);
  const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  return accounts.map((account) => {
    const amount = expenses
      .filter((transaction) => transaction.accountId === account.id)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return {
      account,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0
    };
  });
}

export function getMostUsedAccount(transactions: FinanceTransaction[], accounts: Account[], month: string) {
  const breakdown = getAccountSpendingBreakdown(transactions, accounts, month);
  return [...breakdown].sort((a, b) => b.amount - a.amount)[0] ?? null;
}

export function getAverageDailySpend(transactions: FinanceTransaction[], month: string, now = new Date()): number {
  const total = getMonthlyExpenseTotal(transactions, month);
  const divisor = isCurrentMonth(month, now) ? Math.max(1, now.getDate()) : getDaysInMonth(month);
  return Math.round(total / divisor);
}

export function getLargestExpense(transactions: FinanceTransaction[], categories: Category[], month: string) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const transaction = expenseTransactionsForMonth(transactions, month).sort((a, b) => b.amount - a.amount)[0];
  if (!transaction) return null;
  return {
    transaction,
    category: categoryNames.get(transaction.categoryId ?? "") ?? "Uncategorized"
  };
}

export function getPreviousPeriodComparison(transactions: FinanceTransaction[], month: string, now = new Date()): InsightComparison {
  const currentTotal = getMonthlyExpenseTotal(transactions, month);
  const previousMonth = shiftMonthKey(month, -1);
  const selectedIsCurrent = isCurrentMonth(month, now);
  const currentEndDay = selectedIsCurrent ? now.getDate() : getDaysInMonth(month);
  const previousComparableTotal = expenseTransactionsForMonth(transactions, previousMonth)
    .filter((transaction) => dayOfMonth(transactionDateKey(transaction)) <= Math.min(currentEndDay, getDaysInMonth(previousMonth)))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  if (previousComparableTotal <= 0) {
    return { percentChange: null, direction: "none", message: "Not enough previous data" };
  }

  const raw = ((currentTotal - previousComparableTotal) / previousComparableTotal) * 100;
  const percentChange = Math.round(Math.abs(raw));
  if (percentChange === 0) return { percentChange, direction: "same", message: "Same as last month" };
  return {
    percentChange,
    direction: raw > 0 ? "more" : "less",
    message: raw > 0 ? "More than the same period last month" : "Less than the same period last month"
  };
}

export function getCategoryBreakdown(transactions: FinanceTransaction[], categories: Category[], month: string) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const expenses = expenseTransactionsForMonth(transactions, month);
  const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const rows = new Map<string, number>();

  for (const transaction of expenses) {
    const name = categoryNames.get(transaction.categoryId ?? "") ?? "Uncategorized";
    rows.set(name, (rows.get(name) ?? 0) + transaction.amount);
  }

  return [...rows.entries()]
    .map(([category, amount]) => ({ category, amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function getMonthlyExpenseTrend(transactions: FinanceTransaction[], selectedMonth: string, count = 6) {
  const months = Array.from({ length: count }, (_, index) => shiftMonthKey(selectedMonth, index - (count - 1)));
  return months.map((month) => ({
    month,
    amount: getMonthlyExpenseTotal(transactions, month)
  }));
}

export function getNetForMonth(transactions: FinanceTransaction[], month: string): number {
  return getMonthlyIncomeTotal(transactions, month) - getMonthlyExpenseTotal(transactions, month);
}

function expenseTransactionsForMonth(transactions: FinanceTransaction[], month: string): FinanceTransaction[] {
  return transactions.filter((transaction) => transaction.type === "expense" && transactionDateKey(transaction).startsWith(month));
}

function getDaysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

function isCurrentMonth(month: string, now: Date): boolean {
  return month === monthKey(now);
}

function shiftMonthKey(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthKey(new Date(year, monthNumber - 1 + offset, 1));
}
