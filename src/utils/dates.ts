export function todayKey(): string {
  return dateKey(new Date());
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
  const date = localDateFromKey(key);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function localDateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isInMonth(date: string, selectedMonth: string): boolean {
  return date.startsWith(selectedMonth);
}
