import type { Account, Category, FinanceTransaction } from "../types/finance";
import { formatSignedMMK } from "../utils/currency";
import { displayDate, formatTransactionTime, transactionDateKey } from "../utils/dates";
import { transactionSign } from "../services/financeService";

export function TransactionRow({
  transaction,
  accounts,
  categories,
  showDate = false,
  onClick
}: {
  transaction: FinanceTransaction;
  accounts: Account[];
  categories: Category[];
  showDate?: boolean;
  onClick: () => void;
}) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const source = accounts.find((item) => item.id === transaction.accountId);
  const destination = accounts.find((item) => item.id === transaction.destinationAccountId);
  const isTransfer = transaction.type === "transfer";
  const isOpeningBalance = transaction.type === "openingBalance";
  const title = isOpeningBalance ? `Opening Balance — ${source?.name ?? "Account"}` : transaction.note || (isTransfer ? "Transfer" : category?.name ?? "Uncategorized");
  const detail = isOpeningBalance
    ? `Initial balance · ${formatTransactionTime(transaction)}`
    : isTransfer
      ? `${source?.name ?? "Account"} to ${destination?.name ?? "Account"} · ${showDate ? `${displayDate(transactionDateKey(transaction))} · ` : ""}${formatTransactionTime(transaction)}`
      : `${category?.name ?? "Uncategorized"} · ${source?.name ?? "Account"} · ${showDate ? `${displayDate(transactionDateKey(transaction))} · ` : ""}${formatTransactionTime(transaction)}`;

  return (
    <button type="button" className="transaction-row" onClick={onClick}>
      <span className={`type-dot ${transaction.type}`} aria-hidden="true">{isTransfer ? "↔" : transaction.type === "income" || transaction.type === "openingBalance" ? "+" : "-"}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <b className={transaction.type}>{formatSignedMMK(transaction.amount, transactionSign(transaction.type))}</b>
    </button>
  );
}
