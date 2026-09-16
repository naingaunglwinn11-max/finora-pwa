import type { Account, Category, FinanceTransaction } from "../types/finance";
import { formatSignedMMK } from "../utils/currency";
import { displayDate } from "../utils/dates";
import { transactionSign } from "../services/financeService";

export function TransactionRow({
  transaction,
  accounts,
  categories,
  onClick
}: {
  transaction: FinanceTransaction;
  accounts: Account[];
  categories: Category[];
  onClick: () => void;
}) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const source = accounts.find((item) => item.id === transaction.accountId);
  const destination = accounts.find((item) => item.id === transaction.destinationAccountId);
  const isTransfer = transaction.type === "transfer";
  const title = transaction.note || (isTransfer ? "Transfer" : category?.name ?? "Uncategorized");
  const detail = isTransfer ? `${source?.name ?? "Account"} to ${destination?.name ?? "Account"}` : `${category?.name ?? "Uncategorized"} · ${source?.name ?? "Account"}`;

  return (
    <button type="button" className="transaction-row" onClick={onClick}>
      <span className={`type-dot ${transaction.type}`} aria-hidden="true">{isTransfer ? "↔" : transaction.type === "income" || transaction.type === "openingBalance" ? "+" : "-"}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail} · {displayDate(transaction.date)}</small>
      </span>
      <b className={transaction.type}>{formatSignedMMK(transaction.amount, transactionSign(transaction.type))}</b>
    </button>
  );
}
