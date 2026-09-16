import type { Account, AccountId, Category, FinanceTransaction, TransactionType } from "../types/finance";
import { isInMonth, transactionDateKey } from "../utils/dates";

export function calculateAccountBalance(accountId: AccountId, transactions: FinanceTransaction[]): number {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === "income" || transaction.type === "openingBalance") {
      return transaction.accountId === accountId ? balance + transaction.amount : balance;
    }
    if (transaction.type === "expense") {
      return transaction.accountId === accountId ? balance - transaction.amount : balance;
    }
    if (transaction.type === "transfer") {
      if (transaction.accountId === accountId) return balance - transaction.amount;
      if (transaction.destinationAccountId === accountId) return balance + transaction.amount;
    }
    return balance;
  }, 0);
}

export function calculateTotalBalance(accounts: Account[], transactions: FinanceTransaction[]): number {
  return accounts.reduce((total, account) => total + calculateAccountBalance(account.id, transactions), 0);
}

export function validateAvailableBalance(
  transaction: Pick<FinanceTransaction, "id" | "type" | "amount" | "accountId" | "destinationAccountId">,
  transactions: FinanceTransaction[],
  accountNames: Record<AccountId, string>
): string | null {
  if (transaction.type !== "expense" && transaction.type !== "transfer") return null;

  const sourceTransactions = transactions.filter((item) => item.id !== transaction.id);
  const available = calculateAccountBalance(transaction.accountId, sourceTransactions);
  if (transaction.amount <= available) return null;

  const accountName = accountNames[transaction.accountId];
  return `${accountName} only has ${new Intl.NumberFormat("en-US").format(available)} MMK available.`;
}

export function getMonthlyIncome(transactions: FinanceTransaction[], month: string): number {
  return transactions
    .filter((transaction) => transaction.type === "income" && isInMonth(transactionDateKey(transaction), month))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function getMonthlyExpenses(transactions: FinanceTransaction[], month: string): number {
  return transactions
    .filter((transaction) => transaction.type === "expense" && isInMonth(transactionDateKey(transaction), month))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function getMonthlyNet(transactions: FinanceTransaction[], month: string): number {
  return getMonthlyIncome(transactions, month) - getMonthlyExpenses(transactions, month);
}

export function getRecentTransactions(transactions: FinanceTransaction[], limit = 6): FinanceTransaction[] {
  return [...transactions]
    .sort((a, b) => compareNewestFirst(a, b))
    .slice(0, limit);
}

export function getExpensesByCategory(transactions: FinanceTransaction[], categories: Category[], month: string) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense" || !isInMonth(transactionDateKey(transaction), month)) continue;
    const name = categoryNames.get(transaction.categoryId ?? "") ?? "Uncategorized";
    totals.set(name, (totals.get(name) ?? 0) + transaction.amount);
  }

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function getTransactionsByAccount(accountId: AccountId, transactions: FinanceTransaction[]): FinanceTransaction[] {
  return [...transactions]
    .filter((transaction) => transaction.accountId === accountId || transaction.destinationAccountId === accountId)
    .sort((a, b) => compareNewestFirst(a, b));
}

export function transactionSign(type: TransactionType): "+" | "-" | "" {
  if (type === "income" || type === "openingBalance") return "+";
  if (type === "expense") return "-";
  return "";
}

export function compareNewestFirst(a: FinanceTransaction, b: FinanceTransaction): number {
  const bDateTime = b.transactionDateTime ?? `${b.date}T12:00`;
  const aDateTime = a.transactionDateTime ?? `${a.date}T12:00`;
  return bDateTime.localeCompare(aDateTime) || b.createdAt.localeCompare(a.createdAt);
}
