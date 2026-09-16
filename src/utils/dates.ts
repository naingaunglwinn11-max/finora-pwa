export function todayKey(): string {
  return dateKey(new Date());
}

export function currentDateTimeLocalInput(): string {
  return dateTimeLocalInputValue(new Date());
}

export function dateTimeLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function shiftMonth(key: string, offset: number): string {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

export function displayDate(key: string): string {
  if (key === todayKey()) return "Today";
  if (key === dateKey(new Date(Date.now() - 86_400_000))) return "Yesterday";
  const date = localDateFromKey(key);
  return formatFullDate(date);
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export function isYesterday(key: string): boolean {
  return key === dateKey(new Date(Date.now() - 86_400_000));
}

export function localDateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isInMonth(date: string, selectedMonth: string): boolean {
  return date.startsWith(selectedMonth);
}

export function transactionDateKey(transaction: { date: string; transactionDateTime?: string }): string {
  return transaction.transactionDateTime?.slice(0, 10) || transaction.date;
}

export function transactionDate(transaction: { date: string; transactionDateTime?: string }): Date {
  if (transaction.transactionDateTime) return new Date(transaction.transactionDateTime);
  return new Date(`${transaction.date}T12:00`);
}

export function formatFullDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

export function formatCompactDate(date: Date): string {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(date: Date): string {
  return `${formatFullDate(date)}, ${formatTime(date)}`;
}

export function formatTransactionTime(transaction: { date: string; transactionDateTime?: string }): string {
  return formatTime(transactionDate(transaction));
}

export function formatTransactionDateTime(transaction: { date: string; transactionDateTime?: string }): string {
  return formatDateTime(transactionDate(transaction));
}

export function formatCompactDateTime(transaction: { date: string; transactionDateTime?: string }): string {
  const key = transactionDateKey(transaction);
  const date = transactionDate(transaction);
  const label = isToday(key) ? "Today" : isYesterday(key) ? "Yesterday" : formatCompactDate(localDateFromKey(key));
  return `${label} · ${formatTime(date)}`;
}

export function formatTransactionGroupDate(key: string): string {
  return displayDate(key);
}
