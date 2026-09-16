import type { Account, Category, FinanceTransaction } from "../types/finance";
import { downloadFile } from "./backupService";

export function exportTransactionsCsv(transactions: FinanceTransaction[], accounts: Account[], categories: Category[]): void {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const rows = [
    ["Date", "Type", "Category", "Account", "Destination", "AmountMMK", "Note"],
    ...transactions.map((transaction) => [
      transaction.date,
      transaction.type,
      categoryNames.get(transaction.categoryId ?? "") ?? "",
      accountNames.get(transaction.accountId) ?? transaction.accountId,
      transaction.destinationAccountId ? accountNames.get(transaction.destinationAccountId) ?? transaction.destinationAccountId : "",
      String(transaction.amount),
      transaction.note
    ])
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  downloadFile(`Finora-Transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

function escapeCsv(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
