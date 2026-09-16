import { useEffect, useMemo, useRef, useState } from "react";
import { AmountInput } from "../components/AmountInput";
import { AccountIcon, FinoraMark } from "../components/Brand";
import { BottomNavigation } from "../components/BottomNavigation";
import { TransactionRow } from "../components/TransactionRow";
import { db, getSettings, initializeDatabase } from "../db/db";
import { createBackup, downloadFile, restoreBackup, validateBackup } from "../services/backupService";
import { exportTransactionsCsv } from "../services/exportService";
import {
  calculateAccountBalance,
  calculateTotalBalance,
  compareNewestFirst,
  getExpensesByCategory,
  getMonthlyExpenses,
  getMonthlyIncome,
  getMonthlyNet,
  getRecentTransactions,
  getTransactionsByAccount,
  transactionSign
} from "../services/financeService";
import type { Account, AccountId, Category, FinanceTransaction, FinoraBackup, Settings, ThemePreference, TransactionType } from "../types/finance";
import { amountFromText, formatAmountInput, formatMMK, formatSignedMMK } from "../utils/currency";
import { displayDate, monthKey, monthLabel, shiftMonth, todayKey } from "../utils/dates";
import { createId } from "../utils/ids";

export type Tab = "dashboard" | "transactions" | "accounts" | "settings";

type Snapshot = {
  accounts: Account[];
  categories: Category[];
  transactions: FinanceTransaction[];
  settings: Settings;
};

const emptySnapshot: Snapshot = {
  accounts: [],
  categories: [],
  transactions: [],
  settings: { id: "settings", onboardingCompleted: false, theme: "system" }
};

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [accountDetail, setAccountDetail] = useState<AccountId | null>(null);
  const [status, setStatus] = useState("");

  async function refresh() {
    const [accounts, categories, transactions, settings] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      getSettings()
    ]);
    setSnapshot({
      accounts,
      categories,
      transactions: transactions.sort(compareNewestFirst),
      settings
    });
  }

  useEffect(() => {
    void initializeDatabase()
      .then(async () => {
        await requestPersistentStorage();
        await refresh();
        setReady(true);
      })
      .catch(() => {
        setStatus("Finora could not open local storage. Please try again.");
        setReady(true);
      });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = snapshot.settings.theme;
  }, [snapshot.settings.theme]);

  const balances = useMemo(() => {
    return {
      cash: calculateAccountBalance("cash", snapshot.transactions),
      kbzpay: calculateAccountBalance("kbzpay", snapshot.transactions)
    };
  }, [snapshot.transactions]);

  if (!ready) {
    return <main className="loading"><FinoraMark size={64} /><p>Opening Finora...</p></main>;
  }

  if (!snapshot.settings.onboardingCompleted) {
    return <Onboarding snapshot={snapshot} onComplete={refresh} />;
  }

  return (
    <div className="app-shell">
      <main className="screen">
        {activeTab === "dashboard" && <Dashboard snapshot={snapshot} balances={balances} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} onOpenTransaction={setEditing} />}
        {activeTab === "transactions" && <TransactionsPage snapshot={snapshot} onOpenTransaction={setEditing} />}
        {activeTab === "accounts" && <AccountsPage snapshot={snapshot} balances={balances} accountDetail={accountDetail} onAccountDetail={setAccountDetail} onOpenTransaction={setEditing} />}
        {activeTab === "settings" && <SettingsPage snapshot={snapshot} onRefresh={refresh} onStatus={setStatus} />}
      </main>

      <button type="button" className="fab" onClick={() => setShowAdd(true)} aria-label="Add transaction">+</button>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />

      {showAdd && (
        <TransactionSheet
          snapshot={snapshot}
          balances={balances}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await refresh();
          }}
        />
      )}
      {editing && (
        <TransactionSheet
          snapshot={snapshot}
          balances={balances}
          transaction={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {status && <div className="toast" role="status" onAnimationEnd={() => setStatus("")}>{status}</div>}
    </div>
  );
}

function Onboarding({ snapshot, onComplete }: { snapshot: Snapshot; onComplete: () => Promise<void> }) {
  const [cash, setCash] = useState("");
  const [kbzpay, setKbzpay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const openingCategory = snapshot.categories.find((category) => category.id === "other-income");
      const transactions: FinanceTransaction[] = [];
      const cashAmount = amountFromText(cash);
      const kbzPayAmount = amountFromText(kbzpay);
      if (cashAmount > 0) transactions.push(createOpeningBalance("cash", cashAmount, openingCategory?.id, now));
      if (kbzPayAmount > 0) transactions.push(createOpeningBalance("kbzpay", kbzPayAmount, openingCategory?.id, now));
      await db.transaction("rw", db.transactions, db.settings, async () => {
        if (transactions.length) await db.transactions.bulkPut(transactions);
        await db.settings.update("settings", { onboardingCompleted: true });
      });
      await onComplete();
    } catch {
      setError("Finora couldn't save your starting balances. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding">
      <FinoraMark size={78} />
      <h1>Finora</h1>
      <p>Know exactly where your money goes.</p>
      <AmountInput value={cash} onChange={setCash} autoFocus />
      <label className="field">
        <span>Starting KBZPay Balance</span>
        <div className="input-with-logo">
          {snapshot.accounts.find((account) => account.id === "kbzpay") && <AccountIcon account={snapshot.accounts.find((account) => account.id === "kbzpay")!} size={32} />}
          <input inputMode="numeric" value={kbzpay} onChange={(event) => setKbzpay(formatAmountInput(event.target.value))} placeholder="0" />
        </div>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="button" disabled={saving} onClick={start}>Start Finora</button>
    </main>
  );
}

function Dashboard({
  snapshot,
  balances,
  selectedMonth,
  onMonthChange,
  onOpenTransaction
}: {
  snapshot: Snapshot;
  balances: Record<AccountId, number>;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onOpenTransaction: (transaction: FinanceTransaction) => void;
}) {
  const monthlyIncome = getMonthlyIncome(snapshot.transactions, selectedMonth);
  const monthlyExpenses = getMonthlyExpenses(snapshot.transactions, selectedMonth);
  const monthlyNet = getMonthlyNet(snapshot.transactions, selectedMonth);
  const spending = getExpensesByCategory(snapshot.transactions, snapshot.categories, selectedMonth);
  const total = calculateTotalBalance(snapshot.accounts, snapshot.transactions);
  const maxSpending = Math.max(...spending.map((item) => item.amount), 1);

  return (
    <section className="page">
      <header className="topbar">
        <div><h1>Finora</h1><p>{monthLabel(selectedMonth)}</p></div>
        <FinoraMark size={42} />
      </header>
      <section className="hero-balance">
        <span>Total Balance</span>
        <strong>{formatMMK(total)}</strong>
      </section>
      <div className="month-switcher">
        <button type="button" onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))}>Previous</button>
        <b>{monthLabel(selectedMonth)}</b>
        <button type="button" onClick={() => onMonthChange(shiftMonth(selectedMonth, 1))}>Next</button>
      </div>
      <div className="account-grid">
        {snapshot.accounts.map((account) => (
          <article key={account.id} className="mini-card">
            <AccountIcon account={account} />
            <span>{account.name}</span>
            <strong>{formatMMK(balances[account.id])}</strong>
          </article>
        ))}
      </div>
      <section className="summary-grid" aria-label="This month">
        <article><span>Income</span><b className="income">+{formatMMK(monthlyIncome)}</b></article>
        <article><span>Expenses</span><b className="expense">-{formatMMK(monthlyExpenses)}</b></article>
        <article><span>Net</span><b className={monthlyNet >= 0 ? "income" : "expense"}>{monthlyNet >= 0 ? "+" : "-"}{formatMMK(Math.abs(monthlyNet))}</b></article>
      </section>
      <section className="section-block">
        <h2>Spending</h2>
        {spending.length === 0 ? <p className="empty">No expenses this month.</p> : spending.map((item) => (
          <div className="bar-row" key={item.category}>
            <span>{item.category}</span>
            <div><i style={{ width: `${Math.max(8, (item.amount / maxSpending) * 100)}%` }} /></div>
            <b>{formatMMK(item.amount)}</b>
          </div>
        ))}
      </section>
      <section className="section-block">
        <h2>Recent</h2>
        {getRecentTransactions(snapshot.transactions).map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} onClick={() => onOpenTransaction(transaction)} />
        ))}
      </section>
    </section>
  );
}

function TransactionsPage({ snapshot, onOpenTransaction }: { snapshot: Snapshot; onOpenTransaction: (transaction: FinanceTransaction) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [account, setAccount] = useState<AccountId | "all">("all");
  const filtered = snapshot.transactions.filter((transaction) => {
    const category = snapshot.categories.find((item) => item.id === transaction.categoryId)?.name ?? "";
    const source = snapshot.accounts.find((item) => item.id === transaction.accountId)?.name ?? "";
    const destination = snapshot.accounts.find((item) => item.id === transaction.destinationAccountId)?.name ?? "";
    const haystack = `${transaction.note} ${category} ${source} ${destination}`.toLowerCase();
    return (type === "all" || transaction.type === type)
      && (account === "all" || transaction.accountId === account || transaction.destinationAccountId === account)
      && haystack.includes(query.toLowerCase());
  });
  const groups = groupByDate(filtered);

  return (
    <section className="page">
      <header className="simple-header"><h1>Transactions</h1></header>
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search note, category, or account" aria-label="Search transactions" />
      <Segmented value={type} options={["all", "expense", "income", "transfer"]} onChange={(value) => setType(value as TransactionType | "all")} />
      <Segmented value={account} options={["all", "cash", "kbzpay"]} labels={{ kbzpay: "KBZPay" }} onChange={(value) => setAccount(value as AccountId | "all")} />
      {Object.entries(groups).map(([date, transactions]) => (
        <section className="section-block" key={date}>
          <h2>{displayDate(date)}</h2>
          {transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} onClick={() => onOpenTransaction(transaction)} />)}
        </section>
      ))}
      {filtered.length === 0 && <p className="empty">No transactions found.</p>}
    </section>
  );
}

function AccountsPage({
  snapshot,
  balances,
  accountDetail,
  onAccountDetail,
  onOpenTransaction
}: {
  snapshot: Snapshot;
  balances: Record<AccountId, number>;
  accountDetail: AccountId | null;
  onAccountDetail: (id: AccountId | null) => void;
  onOpenTransaction: (transaction: FinanceTransaction) => void;
}) {
  const selected = accountDetail ? snapshot.accounts.find((account) => account.id === accountDetail) : null;
  const rows = selected ? getTransactionsByAccount(selected.id, snapshot.transactions) : [];
  return (
    <section className="page">
      <header className="simple-header"><h1>Accounts</h1></header>
      {!selected ? (
        <>
          <section className="hero-balance compact"><span>Total</span><strong>{formatMMK(calculateTotalBalance(snapshot.accounts, snapshot.transactions))}</strong></section>
          {snapshot.accounts.map((account) => (
            <button type="button" className="account-card" key={account.id} onClick={() => onAccountDetail(account.id)}>
              <AccountIcon account={account} />
              <span><strong>{account.name}</strong><small>Current balance</small></span>
              <b>{formatMMK(balances[account.id])}</b>
            </button>
          ))}
        </>
      ) : (
        <>
          <button type="button" className="text-button" onClick={() => onAccountDetail(null)}>Back to accounts</button>
          <section className="hero-balance compact"><span>{selected.name}</span><strong>{formatMMK(balances[selected.id])}</strong></section>
          <section className="section-block">
            <h2>Transactions</h2>
            {rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} onClick={() => onOpenTransaction(transaction)} />)}
            {rows.length === 0 && <p className="empty">No transactions for this account.</p>}
          </section>
        </>
      )}
    </section>
  );
}

function SettingsPage({ snapshot, onRefresh, onStatus }: { snapshot: Snapshot; onRefresh: () => Promise<void>; onStatus: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<FinoraBackup | null>(null);
  const [error, setError] = useState("");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

  async function exportBackup() {
    const backup = await createBackup();
    downloadFile(`Finora-Backup-${new Date().toISOString().slice(0, 10)}.finora`, JSON.stringify(backup, null, 2), "application/json");
    await db.settings.update("settings", { lastBackupAt: new Date().toISOString() });
    await onRefresh();
    onStatus("Backup created.");
  }

  async function handleFile(file: File | undefined) {
    setError("");
    setCandidate(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setCandidate(validateBackup(parsed));
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Invalid backup file.");
    }
  }

  async function confirmRestore() {
    if (!candidate) return;
    await restoreBackup(candidate);
    setCandidate(null);
    await onRefresh();
    onStatus("Backup restored.");
  }

  async function setTheme(theme: ThemePreference) {
    await db.settings.update("settings", { theme });
    await onRefresh();
  }

  return (
    <section className="page">
      <header className="simple-header"><h1>Settings</h1></header>
      <section className="section-block">
        <h2>Data</h2>
        <button className="settings-row" type="button" onClick={exportBackup}>Export Backup</button>
        <button className="settings-row" type="button" onClick={() => fileRef.current?.click()}>Restore Backup</button>
        <button className="settings-row" type="button" onClick={() => exportTransactionsCsv(snapshot.transactions, snapshot.accounts, snapshot.categories)}>Export Transactions CSV</button>
        <input ref={fileRef} hidden type="file" accept=".finora,application/json" onChange={(event) => void handleFile(event.target.files?.[0])} />
        {error && <p className="error">{error}</p>}
        {candidate && (
          <div className="restore-card">
            <b>Restore Backup?</b>
            <p>{new Date(candidate.createdAt).toLocaleString()} · {candidate.transactions.length} transactions · version {candidate.backupVersion}</p>
            <small>This replaces current Finora data after validation.</small>
            <button className="danger" type="button" onClick={confirmRestore}>Restore Backup</button>
          </div>
        )}
      </section>
      <section className="section-block">
        <h2>Theme</h2>
        <Segmented value={snapshot.settings.theme} options={["system", "light", "dark"]} onChange={(value) => void setTheme(value as ThemePreference)} />
      </section>
      {!standalone && (
        <section className="section-block">
          <h2>Install Finora</h2>
          <ol className="install-list">
            <li>Open this URL in Safari.</li>
            <li>Tap Share.</li>
            <li>Tap Add to Home Screen.</li>
            <li>Enable Open as Web App if shown.</li>
            <li>Tap Add.</li>
          </ol>
        </section>
      )}
      <section className="section-block">
        <h2>Privacy</h2>
        <p>Your Finora data is stored locally on this device.</p>
        <p>Finora does not send your financial records to a server.</p>
        <p>Deleting Finora's website data or resetting the phone may remove it. Export backups regularly.</p>
      </section>
      <section className="section-block about">
        <FinoraMark size={48} />
        <h2>Finora</h2>
        <p>Personal finance made simple.</p>
        <p>Built for tracking Cash and KBZPay.</p>
        <small>Version 0.1 PWA</small>
      </section>
    </section>
  );
}

function TransactionSheet({
  snapshot,
  balances,
  transaction,
  onClose,
  onSaved
}: {
  snapshot: Snapshot;
  balances: Record<AccountId, number>;
  transaction?: FinanceTransaction;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialType = transaction?.type === "openingBalance" ? "income" : transaction?.type ?? "expense";
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(transaction ? formatAmountInput(String(transaction.amount)) : "");
  const [accountId, setAccountId] = useState<AccountId>(transaction?.accountId ?? "kbzpay");
  const [destinationAccountId, setDestinationAccountId] = useState<AccountId>(transaction?.destinationAccountId ?? (accountId === "cash" ? "kbzpay" : "cash"));
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [date, setDate] = useState(transaction?.date ?? todayKey());
  const [note, setNote] = useState(transaction?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const categories = snapshot.categories.filter((category) => category.type === (type === "income" ? "income" : "expense"));
  const parsedAmount = amountFromText(amount);
  const valid = parsedAmount > 0 && (type === "transfer" ? accountId !== destinationAccountId : Boolean(categoryId));

  useEffect(() => {
    if (type === "transfer") setDestinationAccountId(accountId === "cash" ? "kbzpay" : "cash");
    if (type !== "transfer" && !categoryId) setCategoryId(categories[0]?.id ?? "");
  }, [accountId, type, categoryId, categories]);

  async function save() {
    if (!valid || saving) {
      setError("Choose an amount, account, and category.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const row: FinanceTransaction = {
        id: transaction?.id ?? createId(),
        type,
        amount: parsedAmount,
        accountId,
        destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
        categoryId: type === "transfer" ? undefined : categoryId,
        date,
        note: note.trim(),
        createdAt: transaction?.createdAt ?? now,
        updatedAt: now
      };
      await db.transactions.put(row);
      await onSaved();
    } catch {
      setError("Finora couldn't save this transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    const confirmed = window.confirm("Delete Transaction?\n\nThis will update your balance.");
    if (!confirmed) return;
    await db.transactions.delete(transaction.id);
    await onSaved();
  }

  const actionTitle = type === "expense" ? "Add Expense" : type === "income" ? "Add Income" : "Transfer Money";

  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="sheet" role="dialog" aria-modal="true" aria-label={transaction ? "Edit transaction" : "Add transaction"}>
        <header className="sheet-header">
          <div><h2>{transaction ? "Edit Transaction" : "Add Transaction"}</h2><p>{type === "transfer" ? "Move money between accounts." : "Record money in or out."}</p></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <Segmented value={type} options={["expense", "income", "transfer"]} onChange={(value) => setType(value as TransactionType)} />
        <AmountInput value={amount} onChange={setAmount} autoFocus />
        {type === "transfer" ? (
          <section className="transfer-box">
            <b>From</b>
            <AccountButtons accounts={snapshot.accounts} selected={accountId} onChange={setAccountId} />
            <button className="swap-button" type="button" onClick={() => setAccountId(destinationAccountId)}>Swap</button>
            <b>To</b>
            <div className="locked-account">{snapshot.accounts.find((account) => account.id === destinationAccountId)?.name}</div>
          </section>
        ) : (
          <>
            <label className="label">Account</label>
            <AccountButtons accounts={snapshot.accounts} selected={accountId} onChange={setAccountId} balances={balances} />
            <label className="field">
              <span>Category</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
          </>
        )}
        {type !== "income" && <p className="hint">{snapshot.accounts.find((account) => account.id === accountId)?.name} · {formatMMK(balances[accountId])} available</p>}
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="field"><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" /></label>
        {error && <p className="error">{error}</p>}
        <footer className="sheet-actions">
          {transaction && <button className="danger ghost" type="button" onClick={remove}>Delete</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="button" disabled={!valid || saving} onClick={save}>{transaction ? "Update" : actionTitle}</button>
        </footer>
      </section>
    </div>
  );
}

function AccountButtons({
  accounts,
  selected,
  balances,
  onChange
}: {
  accounts: Account[];
  selected: AccountId;
  balances?: Record<AccountId, number>;
  onChange: (id: AccountId) => void;
}) {
  return (
    <div className="account-selector">
      {accounts.map((account) => (
        <button type="button" key={account.id} className={selected === account.id ? "selected" : ""} onClick={() => onChange(account.id)}>
          <AccountIcon account={account} size={32} />
          <span>{account.name}</span>
          {balances && <small>{formatMMK(balances[account.id])}</small>}
        </button>
      ))}
    </div>
  );
}

function Segmented({ value, options, labels = {}, onChange }: { value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option} type="button" className={value === option ? "selected" : ""} onClick={() => onChange(option)}>
          {labels[option] ?? titleCase(option)}
        </button>
      ))}
    </div>
  );
}

function createOpeningBalance(accountId: AccountId, amount: number, categoryId: string | undefined, now: string): FinanceTransaction {
  return {
    id: createId(),
    type: "openingBalance",
    amount,
    accountId,
    categoryId,
    date: todayKey(),
    note: `Opening Balance - ${accountId === "cash" ? "Cash" : "KBZPay"}`,
    createdAt: now,
    updatedAt: now
  };
}

function groupByDate(transactions: FinanceTransaction[]): Record<string, FinanceTransaction[]> {
  return transactions.reduce<Record<string, FinanceTransaction[]>>((groups, transaction) => {
    groups[transaction.date] = groups[transaction.date] ?? [];
    groups[transaction.date].push(transaction);
    return groups;
  }, {});
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  const persisted = await navigator.storage.persist();
  await db.settings.update("settings", { storagePersisted: persisted });
}

function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
