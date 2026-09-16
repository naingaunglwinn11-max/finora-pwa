import type { FinanceTransaction } from "../types/finance";

export function findLikelyKBZPayDuplicate(candidate: {
  amount: number;
  transactionDateTime: string;
  merchant?: string;
  externalReference?: string;
}, transactions: FinanceTransaction[]): FinanceTransaction | null {
  if (candidate.externalReference) {
    const byReference = transactions.find((transaction) => transaction.source === "kbzpayReceipt" && transaction.externalReference === candidate.externalReference);
    if (byReference) return byReference;
  }
  const candidateTime = new Date(candidate.transactionDateTime).getTime();
  return transactions.find((transaction) => {
    if (transaction.accountId !== "kbzpay" || transaction.amount !== candidate.amount) return false;
    const transactionTime = new Date(transaction.transactionDateTime ?? `${transaction.date}T12:00`).getTime();
    const merchantMatches = !candidate.merchant || !transaction.merchant || normalize(transaction.merchant) === normalize(candidate.merchant);
    return merchantMatches && Math.abs(transactionTime - candidateTime) <= 10 * 60 * 1000;
  }) ?? null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
