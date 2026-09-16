export function formatMMK(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} MMK`;
}

export function formatSignedMMK(amount: number, sign: "+" | "-" | ""): string {
  return `${sign}${formatMMK(amount)}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function amountFromText(value: string): number {
  const raw = digitsOnly(value);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function formatAmountInput(value: string): string {
  const raw = digitsOnly(value);
  if (!raw) return "";
  return new Intl.NumberFormat("en-US").format(Number(raw));
}
