import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import packageJson from "../../package.json";
import { AmountInput } from "../components/AmountInput";
import { AccountIcon, FinoraMark } from "../components/Brand";
import { BottomNavigation } from "../components/BottomNavigation";
import { TransactionRow } from "../components/TransactionRow";
import { db, getSettings, initializeDatabase } from "../db/db";
import { createBackup, downloadFile, restoreBackup, validateBackup } from "../services/backupService";
import { exportTransactionsCsv } from "../services/exportService";
import { findLikelyKBZPayDuplicate } from "../services/duplicateImportService";
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
  transactionSign,
  validateAvailableBalance
} from "../services/financeService";
import {
  getAccountSpendingBreakdown,
  getAverageDailySpend,
  getCategoryBreakdown,
  getLargestExpense,
  getMonthlyExpenseTotal,
  getMonthlyExpenseTrend,
  getMostUsedAccount,
  getNetForMonth,
  getPreviousPeriodComparison,
  getTopExpenseCategory
} from "../services/insightsService";
import { readKBZPayReceipt } from "../services/kbzpayOcrService";
import { suggestedTypeForReceipt, type KBZPayReceiptResult } from "../services/kbzpayReceiptParser";
import { getMerchantCategorySuggestion, rememberMerchantCategory } from "../services/merchantRulesService";
import type { Account, AccountId, Category, FinanceTransaction, FinoraBackup, Settings, ThemePreference, TransactionType } from "../types/finance";
import { amountFromText, formatAmountInput, formatMMK, formatSignedMMK } from "../utils/currency";
import {
  currentDateTimeLocalInput,
  dateKey,
  formatCompactDateTime,
  formatFullDate,
  formatTransactionGroupDate,
  localDateFromKey,
  monthKey,
  monthLabel,
  shiftMonth,
  transactionDateKey
} from "../utils/dates";
import { createId } from "../utils/ids";

export type Tab = "dashboard" | "transactions" | "insights" | "settings";

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
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [accountDetail, setAccountDetail] = useState<AccountId | null>(null);
  const [transactionAccountFilter, setTransactionAccountFilter] = useState<AccountId | "all">("all");
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
        {activeTab === "dashboard" && (
          <Dashboard
            snapshot={snapshot}
            balances={balances}
            onOpenTransaction={setEditing}
            onOpenAccount={setAccountDetail}
            onViewAll={() => setActiveTab("transactions")}
          />
        )}
        {activeTab === "transactions" && (
          <TransactionsPage
            snapshot={snapshot}
            accountFilter={transactionAccountFilter}
            onAccountFilterChange={setTransactionAccountFilter}
            onOpenTransaction={setEditing}
          />
        )}
        {activeTab === "insights" && <InsightsPage snapshot={snapshot} />}
        {activeTab === "settings" && <SettingsPage snapshot={snapshot} onRefresh={refresh} onStatus={setStatus} />}
      </main>

      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} onAdd={() => setShowAdd(true)} />

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
      {accountDetail && (
        <AccountDetailSheet
          accountId={accountDetail}
          snapshot={snapshot}
          balances={balances}
          onClose={() => setAccountDetail(null)}
          onViewAll={(id) => {
            setTransactionAccountFilter(id);
            setAccountDetail(null);
            setActiveTab("transactions");
          }}
          onOpenTransaction={setEditing}
        />
      )}
      {status && <div className="toast" role="status" onAnimationEnd={() => setStatus("")}>{status}</div>}
    </div>
  );
}

function Onboarding({ onComplete }: { snapshot: Snapshot; onComplete: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setSaving(true);
    setError("");
    try {
      await db.transaction("rw", db.settings, async () => {
        await db.settings.update("settings", { onboardingCompleted: true });
      });
      await onComplete();
    } catch {
      setError("Finora couldn't finish setup. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding">
      <FinoraMark size={78} />
      <h1>Finora</h1>
      <p>Know exactly where your money goes.</p>
      <p className="onboarding-copy">Start at zero and record money as it comes in or goes out.</p>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="button" disabled={saving} onClick={start}>Start Finora</button>
    </main>
  );
}

function Dashboard({
  snapshot,
  balances,
  onOpenTransaction,
  onOpenAccount,
  onViewAll
}: {
  snapshot: Snapshot;
  balances: Record<AccountId, number>;
  onOpenTransaction: (transaction: FinanceTransaction) => void;
  onOpenAccount: (accountId: AccountId) => void;
  onViewAll: () => void;
}) {
  const selectedMonth = monthKey();
  const monthlyIncome = getMonthlyIncome(snapshot.transactions, selectedMonth);
  const monthlyExpenses = getMonthlyExpenses(snapshot.transactions, selectedMonth);
  const monthlyNet = getMonthlyNet(snapshot.transactions, selectedMonth);
  const spending = getExpensesByCategory(snapshot.transactions, snapshot.categories, selectedMonth);
  const total = calculateTotalBalance(snapshot.accounts, snapshot.transactions);
  const maxSpending = Math.max(...spending.map((item) => item.amount), 1);

  return (
    <section className="page">
      <header className="topbar">
        <div><h1>Finora</h1><p>{formatFullDate()}</p></div>
        <FinoraMark size={38} />
      </header>
      <section className="hero-balance">
        <span>Total Balance</span>
        <strong>{formatMMK(total)}</strong>
        <small>Cash {formatMMK(balances.cash)} · KBZPay {formatMMK(balances.kbzpay)}</small>
      </section>
      <h2 className="section-title">Accounts</h2>
      <div className="account-grid">
        {snapshot.accounts.map((account) => (
          <button key={account.id} type="button" className="mini-card account-tile" onClick={() => onOpenAccount(account.id)}>
            <div className="dashboard-account-main">
              <AccountIcon account={account} size={34} />
              <span>{account.name}</span>
            </div>
            <strong>{formatMMK(balances[account.id])}</strong>
          </button>
        ))}
      </div>
      <h2 className="section-title">This Month</h2>
      <section className="summary-grid" aria-label="This month">
        <article><span>Income</span><b className="income">+{formatMMK(monthlyIncome)}</b></article>
        <article><span>Expenses</span><b className="expense">-{formatMMK(monthlyExpenses)}</b></article>
        <article><span>Net</span><b className={monthlyNet >= 0 ? "income" : "expense"}>{monthlyNet >= 0 ? "+" : "-"}{formatMMK(Math.abs(monthlyNet))}</b></article>
      </section>
      <section className="section-block">
        <h2>Spending</h2>
        {spending.length === 0 ? <p className="empty calm-empty">No expenses this month.</p> : spending.map((item) => (
          <div className="bar-row" key={item.category}>
            <span>{item.category}</span>
            <div><i style={{ width: `${Math.max(8, (item.amount / maxSpending) * 100)}%` }} /></div>
            <b>{formatMMK(item.amount)}</b>
          </div>
        ))}
      </section>
      <section className="section-block">
        <div className="section-heading-row">
          <h2>Recent Transactions</h2>
          <button type="button" onClick={onViewAll}>View All</button>
        </div>
        {getRecentTransactions(snapshot.transactions, 4).map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} onClick={() => onOpenTransaction(transaction)} />
        ))}
        {snapshot.transactions.length === 0 && <p className="empty">No transactions yet.</p>}
      </section>
    </section>
  );
}

function AccountDetailSheet({
  accountId,
  snapshot,
  balances,
  onClose,
  onViewAll,
  onOpenTransaction
}: {
  accountId: AccountId;
  snapshot: Snapshot;
  balances: Record<AccountId, number>;
  onClose: () => void;
  onViewAll: (accountId: AccountId) => void;
  onOpenTransaction: (transaction: FinanceTransaction) => void;
}) {
  const account = snapshot.accounts.find((item) => item.id === accountId);
  const rows = getTransactionsByAccount(accountId, snapshot.transactions).slice(0, 6);
  if (!account) return null;

  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="sheet account-detail-sheet" role="dialog" aria-modal="true" aria-label={`${account.name} account details`}>
        <header className="sheet-header compact">
          <div className="account-detail-title">
            <AccountIcon account={account} size={38} />
            <div>
              <h2>{account.name}</h2>
              <p>{formatMMK(balances[account.id])}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="section-heading-row account-activity-heading">
          <h2>Recent Activity</h2>
          <button type="button" onClick={() => onViewAll(account.id)}>View All {account.name}</button>
        </div>
        {rows.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} showDate onClick={() => onOpenTransaction(transaction)} />
        ))}
        {rows.length === 0 && <p className="empty">No recent activity for {account.name}.</p>}
      </section>
    </div>
  );
}

function TransactionsPage({
  snapshot,
  accountFilter,
  onAccountFilterChange,
  onOpenTransaction
}: {
  snapshot: Snapshot;
  accountFilter: AccountId | "all";
  onAccountFilterChange: (account: AccountId | "all") => void;
  onOpenTransaction: (transaction: FinanceTransaction) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [visibleMonth, setVisibleMonth] = useState(monthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const transactionDays = useMemo(() => countTransactionsByDate(snapshot.transactions), [snapshot.transactions]);
  const activeFilterCount = (typeFilter !== "all" ? 1 : 0) + (accountFilter !== "all" ? 1 : 0);
  const filtered = snapshot.transactions.filter((transaction) => {
    const category = snapshot.categories.find((item) => item.id === transaction.categoryId)?.name ?? "";
    const source = snapshot.accounts.find((item) => item.id === transaction.accountId)?.name ?? "";
    const destination = snapshot.accounts.find((item) => item.id === transaction.destinationAccountId)?.name ?? "";
    const haystack = `${transaction.note} ${category} ${source} ${destination} ${transaction.amount}`.toLowerCase();
    return (typeFilter === "all" || transaction.type === typeFilter)
      && (accountFilter === "all" || transaction.accountId === accountFilter || transaction.destinationAccountId === accountFilter)
      && (!selectedDate || transactionDateKey(transaction) === selectedDate)
      && haystack.includes(query.toLowerCase());
  });
  const groups = groupByDate(filtered);
  const selectedDateLabel = selectedDate ? formatFullDate(localDateFromKey(selectedDate)) : "Recent Transactions";

  return (
    <section className="page">
      <header className="simple-header"><h1>Transactions</h1></header>
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" aria-label="Search transactions" />
      <div className="transaction-toolbar">
        <button type="button" onClick={() => setCalendarExpanded((value) => !value)} aria-expanded={calendarExpanded}>
          {monthLabel(visibleMonth)}
        </button>
        <button type="button" onClick={() => setFilterOpen(true)} className={activeFilterCount > 0 ? "filter-active" : ""}>
          Filter{activeFilterCount > 0 ? ` • ${activeFilterCount}` : ""}
        </button>
      </div>
      {calendarExpanded && (
        <MiniCalendar
          month={visibleMonth}
          selectedDate={selectedDate}
          transactionDays={transactionDays}
          onMonthChange={setVisibleMonth}
          onSelectDate={(date) => setSelectedDate((current) => current === date ? null : date)}
          onToday={() => {
            const today = dateKey(new Date());
            setVisibleMonth(monthKey());
            setSelectedDate(today);
          }}
        />
      )}
      <div className="section-heading-row transaction-list-heading">
        <h2>{selectedDateLabel}</h2>
        {selectedDate && <button type="button" onClick={() => setSelectedDate(null)}>Clear Date</button>}
      </div>
      {Object.entries(groups).map(([date, transactions]) => (
        <section className="section-block" key={date}>
          {!selectedDate && <h2>{formatTransactionGroupDate(date)}</h2>}
          {transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} accounts={snapshot.accounts} categories={snapshot.categories} onClick={() => onOpenTransaction(transaction)} />)}
        </section>
      ))}
      {filtered.length === 0 && <p className="empty calm-empty">{selectedDate ? `No transactions on ${selectedDateLabel}.` : "No transactions found."}</p>}
      {filterOpen && (
        <FilterSheet
          typeFilter={typeFilter}
          accountFilter={accountFilter}
          onClose={() => setFilterOpen(false)}
          onApply={(nextType, nextAccount) => {
            setTypeFilter(nextType);
            onAccountFilterChange(nextAccount);
            setFilterOpen(false);
          }}
        />
      )}
    </section>
  );
}

function InsightsPage({ snapshot }: { snapshot: Snapshot }) {
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const totalSpent = getMonthlyExpenseTotal(snapshot.transactions, selectedMonth);
  const topCategory = getTopExpenseCategory(snapshot.transactions, snapshot.categories, selectedMonth);
  const averageDaily = getAverageDailySpend(snapshot.transactions, selectedMonth);
  const largestExpense = getLargestExpense(snapshot.transactions, snapshot.categories, selectedMonth);
  const accountBreakdown = getAccountSpendingBreakdown(snapshot.transactions, snapshot.accounts, selectedMonth);
  const mostUsed = getMostUsedAccount(snapshot.transactions, snapshot.accounts, selectedMonth);
  const categoryBreakdown = getCategoryBreakdown(snapshot.transactions, snapshot.categories, selectedMonth);
  const comparison = getPreviousPeriodComparison(snapshot.transactions, selectedMonth);
  const trend = getMonthlyExpenseTrend(snapshot.transactions, selectedMonth);
  const net = getNetForMonth(snapshot.transactions, selectedMonth);
  const maxCategory = Math.max(...categoryBreakdown.map((item) => item.amount), 1);
  const maxTrend = Math.max(...trend.map((item) => item.amount), 1);

  return (
    <section className="page">
      <header className="simple-header stacked">
        <div>
          <h1>Insights</h1>
          <p>Understand where your money goes.</p>
        </div>
      </header>
      <div className="insights-month">
        <button type="button" aria-label="Previous month" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>‹</button>
        <b>{monthLabel(selectedMonth)}</b>
        <button type="button" aria-label="Next month" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>›</button>
      </div>

      {totalSpent === 0 ? (
        <section className="section-block insights-empty">
          <h2>No spending insights yet.</h2>
          <p>Add a few expenses and Finora will show your spending patterns here.</p>
        </section>
      ) : (
        <>
          <section className="insights-hero">
            <span>You spent</span>
            <strong>{formatMMK(totalSpent)}</strong>
            <p>{comparison.message}</p>
          </section>

          <section className="insight-grid compact">
            <InsightCard label="Top Category" value={topCategory?.category ?? "No spending yet"} detail={topCategory ? formatMMK(topCategory.amount) : undefined} />
            <InsightCard label="Average Daily Spend" value={formatMMK(averageDaily)} />
            <InsightCard label="Largest Expense" value={largestExpense ? formatMMK(largestExpense.transaction.amount) : "None"} detail={largestExpense ? `${largestExpense.category}${largestExpense.transaction.note ? ` · ${largestExpense.transaction.note}` : ""}` : undefined} />
            <InsightCard label="Net This Month" value={`${net >= 0 ? "+" : "-"}${formatMMK(Math.abs(net))}`} />
          </section>

          <section className="section-block">
            <h2>Cash vs KBZPay</h2>
            {accountBreakdown.map((item) => (
              <div className="insight-bar" key={item.account.id}>
                <span>{item.account.name}</span>
                <div><i style={{ width: `${item.percent}%` }} /></div>
                <b>{formatMMK(item.amount)} · {item.percent}%</b>
              </div>
            ))}
            {mostUsed && <p className="insight-note">Most used account: <b>{mostUsed.account.name}</b>, {mostUsed.percent}% of spending.</p>}
          </section>

          <section className="section-block">
            <h2>Spending by Category</h2>
            {categoryBreakdown.map((item) => (
              <div className="insight-bar" key={item.category}>
                <span>{item.category}</span>
                <div><i style={{ width: `${Math.max(6, (item.amount / maxCategory) * 100)}%` }} /></div>
                <b>{formatMMK(item.amount)} · {item.percent}%</b>
              </div>
            ))}
          </section>

          <section className="section-block">
            <h2>6-Month Spending Trend</h2>
            <div className="trend-chart" aria-label="Last six months expense trend">
              {trend.map((item) => (
                <div key={item.month}>
                  <span style={{ height: `${Math.max(6, (item.amount / maxTrend) * 100)}%` }} />
                  <small>{monthLabel(item.month).slice(0, 3)}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="insight-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function MiniCalendar({
  month,
  selectedDate,
  transactionDays,
  onMonthChange,
  onSelectDate,
  onToday
}: {
  month: string;
  selectedDate: string | null;
  transactionDays: Map<string, number>;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  onToday: () => void;
}) {
  const days = calendarDays(month);
  const today = dateKey(new Date());

  return (
    <section className="calendar-card" aria-label="Transaction calendar">
      <header>
        <button type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))}>‹</button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))}>›</button>
      </header>
      <button type="button" className="today-button" onClick={onToday}>Today</button>
      <div className="calendar-grid weekdays">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const count = transactionDays.get(day) ?? 0;
          const date = localDateFromKey(day);
          return (
            <button
              key={day}
              type="button"
              className={`${selectedDate === day ? "selected" : ""} ${today === day ? "today" : ""}`}
              onClick={() => onSelectDate(day)}
              aria-label={`${formatFullDate(date)}, ${count} transaction${count === 1 ? "" : "s"}`}
            >
              <span>{date.getDate()}</span>
              {count > 0 && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FilterSheet({
  typeFilter,
  accountFilter,
  onClose,
  onApply
}: {
  typeFilter: TransactionType | "all";
  accountFilter: AccountId | "all";
  onClose: () => void;
  onApply: (type: TransactionType | "all", account: AccountId | "all") => void;
}) {
  const [draftType, setDraftType] = useState<TransactionType | "all">(typeFilter);
  const [draftAccount, setDraftAccount] = useState<AccountId | "all">(accountFilter);
  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="sheet filter-sheet" role="dialog" aria-modal="true" aria-label="Filter transactions">
        <header className="sheet-header compact">
          <h2>Filter</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <label className="label">Type</label>
        <Segmented value={draftType} options={["all", "expense", "income", "transfer"]} onChange={(value) => setDraftType(value as TransactionType | "all")} />
        <label className="label">Account</label>
        <Segmented value={draftAccount} options={["all", "cash", "kbzpay"]} labels={{ all: "All Accounts", kbzpay: "KBZPay" }} onChange={(value) => setDraftAccount(value as AccountId | "all")} />
        <footer className="sheet-actions two">
          <button type="button" onClick={() => {
            setDraftType("all");
            setDraftAccount("all");
          }}>Reset</button>
          <button className="primary" type="button" onClick={() => onApply(draftType, draftAccount)}>Apply</button>
        </footer>
      </section>
    </div>
  );
}

function SettingsPage({ snapshot, onRefresh, onStatus }: { snapshot: Snapshot; onRefresh: () => Promise<void>; onStatus: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<FinoraBackup | null>(null);
  const [error, setError] = useState("");
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const lastBackup = snapshot.settings.lastBackupAt ? new Date(snapshot.settings.lastBackupAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";

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

  function checkData() {
    const transactionLabel = snapshot.transactions.length === 1 ? "transaction" : "transactions";
    onStatus(`Data check complete: ${snapshot.transactions.length} ${transactionLabel} stored locally.`);
  }

  return (
    <section className="page settings-page">
      <header className="simple-header settings-header">
        <h1>Settings</h1>
        <p>Manage your Finora experience and data.</p>
      </header>

      <SettingsGroup title="Appearance">
        <div className="theme-card-row" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as ThemePreference[]).map((theme) => (
            <button
              key={theme}
              className={`theme-card ${snapshot.settings.theme === theme ? "selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={snapshot.settings.theme === theme}
              onClick={() => void setTheme(theme)}
            >
              <ThemePreview theme={theme} />
              <span className="theme-card-label">{titleCase(theme)}</span>
              <small>{theme === "system" ? "Follow iPhone" : theme === "light" ? "Bright mode" : "Low-light mode"}</small>
              <b aria-hidden="true">✓</b>
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Data & Backup">
        <SettingRow icon="download" title="Export Backup" subtitle="Create a copy of your Finora data" value={lastBackup} onClick={exportBackup} />
        <SettingRow icon="upload" title="Restore Backup" subtitle="Import a saved Finora backup" onClick={() => fileRef.current?.click()} />
        <SettingRow icon="file" title="Export Transactions CSV" subtitle="Save transactions for spreadsheets" onClick={() => exportTransactionsCsv(snapshot.transactions, snapshot.accounts, snapshot.categories)} />
        <SettingRow icon="shield" title="Check Data" subtitle="Verify local records are readable" onClick={checkData} />
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
      </SettingsGroup>

      <SettingsGroup title="App">
        <SettingRow icon="wallet" title="Currency" subtitle="Finora currently supports MMK" value="MMK" />
        <SettingRow icon="database" title="Storage" subtitle="Your Finora data is kept locally." value={snapshot.settings.storagePersisted ? "Protected" : "On this iPhone"} />
        <SettingRow
          icon={standalone ? "check" : "phone"}
          title={standalone ? "Installed" : "Install Finora"}
          subtitle={standalone ? "Finora is running as a Home Screen app." : "Add Finora to your Home Screen."}
          value={standalone ? "Ready" : "Steps"}
          onClick={standalone ? undefined : () => setShowInstallSteps((visible) => !visible)}
        />
        {!standalone && showInstallSteps && (
          <ol className="install-list">
            <li>Open this URL in Safari.</li>
            <li>Tap Share.</li>
            <li>Tap Add to Home Screen.</li>
            <li>Enable Open as Web App if shown.</li>
            <li>Tap Add.</li>
          </ol>
        )}
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <SettingRow icon="lock" title="Local Data" subtitle="No account or cloud database is required." />
        <SettingRow icon="network" title="Network" subtitle="Finora does not upload your financial transactions to a Finora server." />
      </SettingsGroup>

      <SettingsGroup title="About">
        <div className="about-panel">
          <FinoraMark size={46} />
          <div>
            <h2>Finora</h2>
            <p>Personal finance made simple.</p>
          </div>
          <span>Version {packageJson.version}</span>
        </div>
      </SettingsGroup>
    </section>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const groupId = `settings-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <section className="settings-group" aria-labelledby={groupId}>
      <h2 id={groupId}>{title}</h2>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onClick
}: {
  icon: SettingsIconName;
  title: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void | Promise<void>;
}) {
  const content = (
    <>
      <SettingsIcon name={icon} />
      <span>
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {value && <b>{value}</b>}
      {onClick && <i aria-hidden="true">›</i>}
    </>
  );
  if (!onClick) return <div className="settings-row">{content}</div>;
  return <button className="settings-row" type="button" onClick={() => void onClick()}>{content}</button>;
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <span className={`theme-preview ${theme}`}>
      <span className="mini-top" />
      <span className="mini-balance" />
      <span className="mini-lines"><i /><i /></span>
      <span className="mini-nav" />
    </span>
  );
}

type SettingsIconName = "download" | "upload" | "file" | "shield" | "wallet" | "database" | "phone" | "check" | "lock" | "network";

function SettingsIcon({ name }: { name: SettingsIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  return (
    <svg className="settings-icon" aria-hidden="true" viewBox="0 0 24 24">
      {name === "download" && <><path {...common} d="M12 4v10" /><path {...common} d="m8 10 4 4 4-4" /><path {...common} d="M5 20h14" /></>}
      {name === "upload" && <><path {...common} d="M12 20V10" /><path {...common} d="m8 14 4-4 4 4" /><path {...common} d="M5 4h14" /></>}
      {name === "file" && <><path {...common} d="M7 3h7l4 4v14H7z" /><path {...common} d="M14 3v5h5" /><path {...common} d="M9 13h6" /><path {...common} d="M9 17h6" /></>}
      {name === "shield" && <><path {...common} d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path {...common} d="m9 12 2 2 4-5" /></>}
      {name === "wallet" && <><path {...common} d="M4 7h15a2 2 0 0 1 2 2v9H4z" /><path {...common} d="M4 7V5h13" /><path {...common} d="M16 13h5" /></>}
      {name === "database" && <><ellipse {...common} cx="12" cy="5" rx="7" ry="3" /><path {...common} d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path {...common} d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>}
      {name === "phone" && <><rect {...common} x="8" y="3" width="8" height="18" rx="2" /><path {...common} d="M11 18h2" /></>}
      {name === "check" && <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="m8 12 2.5 2.5L16 9" /></>}
      {name === "lock" && <><rect {...common} x="5" y="10" width="14" height="10" rx="2" /><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
      {name === "network" && <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M3 12h18" /><path {...common} d="M12 3a14 14 0 0 1 0 18" /><path {...common} d="M12 3a14 14 0 0 0 0 18" /></>}
    </svg>
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
  const initialTransactionDateTime = useMemo(() => transaction?.transactionDateTime ?? (transaction?.date ? `${transaction.date}T12:00` : currentDateTimeLocalInput()), [transaction]);
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(transaction ? formatAmountInput(String(transaction.amount)) : "");
  const [accountId, setAccountId] = useState<AccountId>(transaction?.accountId ?? "kbzpay");
  const [destinationAccountId, setDestinationAccountId] = useState<AccountId>(transaction?.destinationAccountId ?? (accountId === "cash" ? "kbzpay" : "cash"));
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [transactionDateTime, setTransactionDateTime] = useState(initialTransactionDateTime);
  const [dateTimeEditorOpen, setDateTimeEditorOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(initialTransactionDateTime.slice(0, 10));
  const [draftTime, setDraftTime] = useState(initialTransactionDateTime.slice(11, 16));
  const [note, setNote] = useState(transaction?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");
  const [receiptResult, setReceiptResult] = useState<KBZPayReceiptResult | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<FinanceTransaction | null>(null);
  const [importAnyway, setImportAnyway] = useState(false);
  const [entryMethod, setEntryMethod] = useState<"manual" | "receipt">("manual");
  const sheetRef = useRef<HTMLElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const dragRef = useRef({ pointerId: 0, startY: 0, lastY: 0, lastTime: 0, velocity: 0, currentY: 0 });
  const categories = snapshot.categories.filter((category) => category.type === (type === "income" ? "income" : "expense"));
  const parsedAmount = amountFromText(amount);
  const canUseReceiptImport = !transaction && type !== "transfer" && accountId === "kbzpay";
  const showReceiptImport = canUseReceiptImport && entryMethod === "receipt";
  const valid = parsedAmount > 0 && Boolean(transactionDateTime) && (type === "transfer" ? accountId !== destinationAccountId : Boolean(categoryId));
  const hasUnsavedChanges = transaction
    ? amount !== formatAmountInput(String(transaction.amount))
      || type !== initialType
      || accountId !== transaction.accountId
      || destinationAccountId !== (transaction.destinationAccountId ?? (transaction.accountId === "cash" ? "kbzpay" : "cash"))
      || categoryId !== (transaction.categoryId ?? "")
      || transactionDateTime !== initialTransactionDateTime
      || note !== transaction.note
    : amount.trim() !== ""
      || type !== "expense"
      || accountId !== "kbzpay"
      || note.trim() !== ""
      || transactionDateTime !== initialTransactionDateTime
      || Boolean(receiptResult);

  useEffect(() => {
    if (type === "transfer") setDestinationAccountId(accountId === "cash" ? "kbzpay" : "cash");
    if (type !== "transfer" && !categoryId) setCategoryId(categories[0]?.id ?? "");
  }, [accountId, type, categoryId, categories]);

  useEffect(() => {
    if (!canUseReceiptImport) {
      if (entryMethod !== "manual") setEntryMethod("manual");
      clearReceiptImport();
    }
  }, [canUseReceiptImport, entryMethod]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function finishClose(afterClose: () => void | Promise<void>) {
    const sheetHeight = sheetRef.current?.offsetHeight ?? window.innerHeight;
    setClosing(true);
    setDragY(Math.max(dragRef.current.currentY, sheetHeight));
    closeTimerRef.current = window.setTimeout(() => {
      void afterClose();
    }, 240);
  }

  function requestClose({ force = false, afterClose = onClose }: { force?: boolean; afterClose?: () => void | Promise<void> } = {}) {
    if (!force && hasUnsavedChanges) {
      setConfirmDiscard(true);
      setDragging(false);
      setDragY(0);
      dragRef.current.currentY = 0;
      return;
    }
    finishClose(afterClose);
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (closing) return;
    if (event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const now = performance.now();
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: now, velocity: 0, currentY: 0 };
    setConfirmDiscard(false);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!dragging || event.pointerId !== dragRef.current.pointerId) return;
    const nextY = Math.max(0, event.clientY - dragRef.current.startY);
    const now = performance.now();
    const dt = Math.max(1, now - dragRef.current.lastTime);
    dragRef.current.velocity = ((event.clientY - dragRef.current.lastY) / dt) * 1000;
    dragRef.current.lastY = event.clientY;
    dragRef.current.lastTime = now;
    dragRef.current.currentY = nextY;
    setDragY(nextY);
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (!dragging || event.pointerId !== dragRef.current.pointerId) return;
    if (event.currentTarget.releasePointerCapture && event.pointerId !== undefined) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight ?? 560;
    const distanceThreshold = Math.min(180, sheetHeight * 0.28);
    const shouldDismiss = dragRef.current.currentY > distanceThreshold || dragRef.current.velocity > 920;
    if (shouldDismiss) requestClose();
    else {
      dragRef.current.currentY = 0;
      setDragY(0);
    }
  }

  async function save() {
    if (!valid || saving) {
      setError("Choose an amount, account, category, and date/time.");
      return;
    }
    if (showReceiptImport && duplicateMatch && !importAnyway) {
      setError("This receipt may already be in Finora. Review it, then tap Import Anyway if this is a new transaction.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const savedType = transaction?.type === "openingBalance" ? "openingBalance" : type;
      const row: FinanceTransaction = {
        id: transaction?.id ?? createId(),
        type: savedType,
        amount: parsedAmount,
        accountId,
        destinationAccountId: type === "transfer" ? destinationAccountId : undefined,
        categoryId: type === "transfer" ? undefined : categoryId,
        date: transactionDateTime.slice(0, 10),
        transactionDateTime,
        note: note.trim(),
        createdAt: transaction?.createdAt ?? now,
        updatedAt: now,
        source: showReceiptImport && receiptResult ? "kbzpayReceipt" : transaction?.source ?? "manual",
        merchant: showReceiptImport ? receiptResult?.merchant : transaction?.merchant,
        externalReference: showReceiptImport ? receiptResult?.transactionReference : transaction?.externalReference,
        externalTransactionType: showReceiptImport ? receiptResult?.externalTransactionType : transaction?.externalTransactionType,
        recipientMaskedAccount: showReceiptImport ? receiptResult?.recipientMaskedAccount : transaction?.recipientMaskedAccount,
        importedAt: showReceiptImport && receiptResult ? now : transaction?.importedAt
      };
      const accountNames = Object.fromEntries(snapshot.accounts.map((account) => [account.id, account.name])) as Record<AccountId, string>;
      const balanceError = validateAvailableBalance(row, snapshot.transactions, accountNames);
      if (balanceError) {
        setError(balanceError);
        return;
      }
      await db.transactions.put(row);
      if (showReceiptImport && receiptResult?.merchant && row.categoryId) await rememberMerchantCategory(receiptResult.merchant, row.categoryId);
      requestClose({ force: true, afterClose: onSaved });
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
  const dismissDistance = Math.max(160, Math.min(260, (sheetRef.current?.offsetHeight ?? 560) * 0.3));
  const backdropOpacity = Math.max(0, 1 - Math.min(1, dragY / dismissDistance));
  const dateValue = transactionDateTime.slice(0, 10);
  const timeValue = transactionDateTime.slice(11, 16);

  function openDateTimeEditor() {
    setDraftDate(dateValue);
    setDraftTime(timeValue);
    setDateTimeEditorOpen(true);
  }

  function applyDateTimeEditor() {
    setTransactionDateTime(`${draftDate}T${draftTime || "12:00"}`);
    setDateTimeEditorOpen(false);
  }

  async function importReceipt(file: File | undefined) {
    if (!file) return;
    setImportError("");
    setImportStatus("Reading KBZPay receipt...");
    setReceiptResult(null);
    setDuplicateMatch(null);
    setImportAnyway(false);
    try {
      const result = await readKBZPayReceipt(file);
      setReceiptResult(result);
      const nextType = suggestedTypeForReceipt(result);
      const nextAmount = result.amount ? formatAmountInput(String(result.amount)) : "";
      const nextTime = result.time ?? timeValue ?? "12:00";
      const nextDateTime = `${result.date ?? dateValue}T${nextTime}`;
      const category = await getMerchantCategorySuggestion(result.merchant, snapshot.categories, nextType, result.note);
      setType(nextType);
      setAccountId("kbzpay");
      setAmount((current) => current.trim() ? current : nextAmount);
      setTransactionDateTime((current) => current || nextDateTime);
      setNote((current) => current.trim() ? current : result.note ?? result.merchant ?? "");
      if (category) setCategoryId(category);
      if (result.amount) {
        setDuplicateMatch(findLikelyKBZPayDuplicate({
          amount: result.amount,
          transactionDateTime: nextDateTime,
          merchant: result.merchant,
          externalReference: result.transactionReference
        }, snapshot.transactions));
      }
    } catch (receiptError) {
      setImportError(receiptError instanceof Error ? receiptError.message : "We couldn't read this receipt.");
    } finally {
      setImportStatus("");
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  }

  function clearReceiptImport() {
    setReceiptResult(null);
    setDuplicateMatch(null);
    setImportAnyway(false);
    setImportError("");
    setImportStatus("");
  }

  return (
    <div
      className={`sheet-backdrop ${closing ? "closing" : ""}`}
      role="presentation"
      style={{ "--sheet-backdrop-progress": backdropOpacity } as CSSProperties & Record<"--sheet-backdrop-progress", number>}
      onPointerDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section
        ref={sheetRef}
        className={`sheet transaction-sheet ${dragging ? "dragging" : ""} ${closing ? "closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-sheet-title"
        style={{ "--sheet-drag-y": `${dragY}px` } as CSSProperties & Record<"--sheet-drag-y", string>}
      >
        <div
          className="sheet-grabber"
          role="presentation"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span aria-hidden="true" />
        </div>
        <header className="sheet-header compact">
          <div><h2 id="transaction-sheet-title">{transaction ? "Edit Transaction" : "Add Transaction"}</h2><p>{type === "transfer" ? "Move money between accounts." : "Record money in or out."}</p></div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              requestClose({ force: true });
            }}
            aria-label="Close Add Transaction"
          >
            ×
          </button>
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
            {canUseReceiptImport && (
              <div className="entry-method">
                <label className="label">Entry Method</label>
                <Segmented
                  value={entryMethod}
                  options={["manual", "receipt"]}
                  onChange={(value) => {
                    setEntryMethod(value as "manual" | "receipt");
                    setError("");
                    setImportError("");
                  }}
                />
              </div>
            )}
            <label className="field">
              <span>Category</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
          </>
        )}
        {type !== "income" && <p className="hint">{snapshot.accounts.find((account) => account.id === accountId)?.name} · {formatMMK(balances[accountId])} available</p>}
        <div className="field date-time-field">
          <span>Date & Time</span>
          <button
            className="date-time-summary"
            type="button"
            aria-label={`Transaction date and time, ${formatCompactDateTime({ date: dateValue, transactionDateTime })}`}
            onClick={openDateTimeEditor}
          >
            <b>{formatCompactDateTime({ date: dateValue, transactionDateTime })}</b>
            <i aria-hidden="true">›</i>
          </button>
        </div>
        <label className="field"><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" /></label>
        {transaction?.source === "kbzpayReceipt" && (
          <section className="receipt-review-card compact">
            <h3>Imported from KBZPay receipt</h3>
            <dl>
              {transaction.merchant && <div><dt>Merchant</dt><dd>{transaction.merchant}</dd></div>}
              {transaction.recipientMaskedAccount && <div><dt>Masked Account</dt><dd>{transaction.recipientMaskedAccount}</dd></div>}
              {transaction.externalReference && <div><dt>Reference</dt><dd>{transaction.externalReference}</dd></div>}
              {transaction.externalTransactionType && <div><dt>KBZPay Type</dt><dd>{transaction.externalTransactionType}</dd></div>}
              {transaction.importedAt && <div><dt>Imported</dt><dd>{formatFullDate(new Date(transaction.importedAt))}</dd></div>}
            </dl>
          </section>
        )}
        {showReceiptImport && (
          <section className="kbzpay-import-card">
            <div>
              <AccountIcon account={snapshot.accounts.find((account) => account.id === "kbzpay") ?? snapshot.accounts[0]} size={34} />
              <span>
                <b>KBZPay Receipt</b>
                <small>Choose a screenshot to auto-fill this form, or switch back to Manual.</small>
              </span>
            </div>
            <button type="button" onClick={() => receiptInputRef.current?.click()} disabled={Boolean(importStatus)}>
              {importStatus ? "Reading..." : "Choose KBZPay Receipt"}
            </button>
            <input ref={receiptInputRef} hidden type="file" accept="image/*" onChange={(event) => void importReceipt(event.target.files?.[0])} />
          </section>
        )}
        {showReceiptImport && importStatus && <p className="hint">{importStatus}</p>}
        {showReceiptImport && importError && (
          <div className="receipt-warning">
            <b>We couldn't read this receipt.</b>
            <p>{importError}</p>
            <button type="button" onClick={() => receiptInputRef.current?.click()}>Try Another Image</button>
            <button type="button" onClick={() => {
              setEntryMethod("manual");
              setImportError("");
            }}>Enter Manually</button>
          </div>
        )}
        {showReceiptImport && receiptResult && (
          <section className="receipt-review-card">
            <h3>KBZPay Receipt</h3>
            {receiptResult.warnings.map((warning) => <p className="receipt-warning-line" key={warning}>{warning}</p>)}
            {duplicateMatch && (
              <div className="receipt-duplicate">
                <b>This receipt may already be in Finora.</b>
                <p>{formatMMK(duplicateMatch.amount)} · {duplicateMatch.note || duplicateMatch.merchant || "KBZPay transaction"}</p>
                <div>
                  <button type="button" onClick={clearReceiptImport}>Cancel</button>
                  <button type="button" onClick={() => setImportAnyway(true)}>{importAnyway ? "Import Anyway Selected" : "Import Anyway"}</button>
                </div>
              </div>
            )}
            <dl>
              <div><dt>Account</dt><dd>KBZPay</dd></div>
              {receiptResult.merchant && <div><dt>Recipient</dt><dd>{receiptResult.merchant}</dd></div>}
              {receiptResult.recipientMaskedAccount && <div><dt>Masked Account</dt><dd>{receiptResult.recipientMaskedAccount}</dd></div>}
              {receiptResult.note && <div><dt>Note</dt><dd>{receiptResult.note}</dd></div>}
              {receiptResult.transactionReference && <div><dt>Transaction No</dt><dd>{receiptResult.transactionReference}</dd></div>}
              {receiptResult.externalTransactionType && <div><dt>KBZPay Type</dt><dd>{receiptResult.externalTransactionType}</dd></div>}
              <div><dt>Source</dt><dd>KBZPay Receipt</dd></div>
            </dl>
          </section>
        )}
        {error && <p className="error">{error}</p>}
        {confirmDiscard && (
          <div className="discard-confirm" role="alertdialog" aria-label="Discard transaction">
            <div>
              <b>Discard transaction?</b>
              <p>Your entered information will be lost.</p>
            </div>
            <button type="button" onClick={() => setConfirmDiscard(false)}>Keep Editing</button>
            <button className="danger" type="button" onClick={() => requestClose({ force: true })}>Discard</button>
          </div>
        )}
        <footer className={`sheet-actions ${transaction ? "" : "two"}`}>
          {transaction && <button className="danger ghost" type="button" onClick={remove}>Delete</button>}
          <button type="button" onClick={() => requestClose()}>Cancel</button>
          <button className="primary" type="button" disabled={!valid || saving} onClick={save}>{transaction ? "Update" : actionTitle}</button>
        </footer>
        {dateTimeEditorOpen && (
          <div className="datetime-editor-backdrop" role="presentation" onPointerDown={(event) => {
            if (event.target === event.currentTarget) setDateTimeEditorOpen(false);
          }}>
            <section className="datetime-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="datetime-editor-title">
              <header>
                <h3 id="datetime-editor-title">Date & Time</h3>
                <p>{formatCompactDateTime({ date: draftDate, transactionDateTime: `${draftDate}T${draftTime || "12:00"}` })}</p>
              </header>
              <label className="field">
                <span>Date</span>
                <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
              </label>
              <label className="field">
                <span>Time</span>
                <input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} />
              </label>
              <footer className="datetime-editor-actions">
                <button type="button" onClick={() => setDateTimeEditorOpen(false)}>Cancel</button>
                <button className="primary" type="button" onClick={applyDateTimeEditor}>Done</button>
              </footer>
            </section>
          </div>
        )}
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

function groupByDate(transactions: FinanceTransaction[]): Record<string, FinanceTransaction[]> {
  return transactions.reduce<Record<string, FinanceTransaction[]>>((groups, transaction) => {
    const key = transactionDateKey(transaction);
    groups[key] = groups[key] ?? [];
    groups[key].push(transaction);
    return groups;
  }, {});
}

function countTransactionsByDate(transactions: FinanceTransaction[]): Map<string, number> {
  return transactions.reduce((counts, transaction) => {
    const key = transactionDateKey(transaction);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function calendarDays(month: string): Array<string | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const last = new Date(year, monthNumber, 0);
  const days: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(dateKey(new Date(year, monthNumber - 1, day)));
  }
  return days;
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  const persisted = await navigator.storage.persist();
  await db.settings.update("settings", { storagePersisted: persisted });
}

function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
