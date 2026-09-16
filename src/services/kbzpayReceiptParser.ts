import type { Category, TransactionType } from "../types/finance";
import { dateKey, dateTimeLocalInputValue, localDateFromKey } from "../utils/dates";

export interface KBZPayReceiptResult {
  amount?: number;
  date?: string;
  time?: string;
  merchant?: string;
  recipient?: string;
  recipientMaskedAccount?: string;
  transactionReference?: string;
  externalTransactionType?: string;
  note?: string;
  direction: "outgoing" | "incoming" | "unknown";
  rawText?: string;
  confidence: number;
  warnings: string[];
}

const monthNumbers: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

export function parseKBZPayReceipt(rawText: string, now = new Date()): KBZPayReceiptResult {
  const text = normalizeReceiptText(rawText);
  const normalized = normalizeText(text);
  const labeledAmount = extractLabeledAmount(text);
  const topAmount = extractTopAmount(text);
  const amount = labeledAmount?.amount ?? topAmount?.amount;
  const labeledDateTime = extractTransactionDateTime(text);
  const date = labeledDateTime?.date ?? extractDate(text) ?? dateKey(now);
  const time = labeledDateTime?.time ?? extractTime(text) ?? dateTimeLocalInputValue(now).slice(11, 16);
  const counterparty = extractCounterparty(text);
  const merchant = counterparty?.name ?? extractMerchant(text);
  const reference = extractReference(text);
  const externalTransactionType = extractTransactionType(text);
  const note = extractNote(text);
  const direction = detectDirection(normalized, labeledAmount ?? topAmount);
  const warnings: string[] = [];
  if (!isLikelyKBZPayReceipt(text)) warnings.push("This may not be a KBZPay receipt.");
  if (!amount) warnings.push("We couldn't confidently detect the amount.");
  if (labeledAmount?.hasNonZeroFraction || topAmount?.hasNonZeroFraction) warnings.push("Please check the transaction amount.");
  if (labeledAmount && topAmount && labeledAmount.amount !== topAmount.amount) warnings.push("Please check the transaction amount.");
  if (!labeledDateTime && (!extractDate(text) || !extractTime(text))) warnings.push("Please check the date and time.");
  if (direction === "unknown") warnings.push("Please confirm whether this is income or expense.");
  return {
    amount,
    date,
    time,
    merchant,
    recipient: merchant,
    recipientMaskedAccount: counterparty?.maskedAccount,
    transactionReference: reference,
    externalTransactionType,
    note,
    direction,
    rawText,
    confidence: [amount, date, time, merchant, reference].filter(Boolean).length / 5,
    warnings
  };
}

export function suggestedTypeForReceipt(result: KBZPayReceiptResult): Exclude<TransactionType, "transfer" | "openingBalance"> {
  return result.direction === "incoming" ? "income" : "expense";
}

export function suggestCategoryIdForMerchant(merchant: string | undefined, categories: Category[], type: "income" | "expense"): string {
  const available = categories.filter((category) => category.type === type);
  if (type === "income") return available.find((category) => category.id === "other-income")?.id ?? available[0]?.id ?? "";
  const normalized = normalizeMerchantName(merchant ?? "");
  const rules: Array<[string[], string]> = [
    [["grab", "taxi", "yango", "bus"], "transport"],
    [["kfc", "restaurant", "cafe", "coffee", "food", "burger", "pizza"], "food"],
    [["city mart", "market", "store", "shopping", "supermarket"], "shopping"],
    [["pharmacy", "clinic", "hospital", "health"], "health"],
    [["cinema", "movie", "game", "entertainment"], "entertainment"],
    [["family", "friend", "friends"], "family"],
    [["bill", "meter", "electric", "internet", "phone"], "bills"]
  ];
  const match = rules.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return available.find((category) => category.id === match?.[1])?.id
    ?? available.find((category) => category.id === "other-expense")?.id
    ?? available[0]?.id
    ?? "";
}

export function normalizeMerchantName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeReceiptText(value: string): string {
  return value
    .replace(/\r/g, "\n")
    .replace(/[−–—]/g, "-")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function isLikelyKBZPayReceipt(text: string): boolean {
  const indicators = [/kbz bank/i, /kbzpay/i, /e-?receipt/i, /transaction time/i, /transaction no/i];
  return indicators.filter((indicator) => indicator.test(text)).length >= 2;
}

function extractAmount(text: string): number | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const labeled = lines.find((line) => /(amount|payment|paid|transferred|received|total)/i.test(line) && /(mmk|ks|kyat|[0-9][0-9,]+)/i.test(line));
  return parseAmountFromText(labeled ?? text)?.amount;
}

function extractLabeledAmount(text: string): ParsedAmount | undefined {
  const value = extractField(text, ["Amount", "Payment Amount", "Paid Amount", "Received Amount", "Total Amount"]);
  return value ? parseAmountFromText(value) : undefined;
}

function extractTopAmount(text: string): ParsedAmount | undefined {
  return parseAmountFromText(text.split("\n").find((line) => amountPattern.test(line)) ?? text);
}

type ParsedAmount = { amount: number; sign: "negative" | "positive" | "unknown"; hasNonZeroFraction: boolean };

const amountPattern = /[-+]?\s*(?:MMK|Ks|Kyat)?\s*[0-9][0-9,\s]*(?:[.°]\s*[0-9\s]{1,2})?\s*(?:MMK|Ks|Kyat)\b|(?:MMK|Ks|Kyat)\s*[-+]?\s*[0-9][0-9,\s]*(?:[.°]\s*[0-9\s]{1,2})?/i;
const amountRegex = /([-+]?)\s*(?:MMK|Ks|Kyat)?\s*([0-9][0-9,\s]*)(?:[.°]\s*([0-9\s]{1,2}))?\s*(?:MMK|Ks|Kyat)\b|(?:MMK|Ks|Kyat)\s*([-+]?)\s*([0-9][0-9,\s]*)(?:[.°]\s*([0-9\s]{1,2}))?/gi;

function parseAmountFromText(text: string): ParsedAmount | undefined {
  amountRegex.lastIndex = 0;
  for (const match of text.matchAll(amountRegex)) {
    const sign = match[1] || match[4] || "";
    const whole = (match[2] || match[5] || "").replace(/[,\s]/g, "");
    const fraction = (match[3] || match[6] || "").replace(/\s/g, "");
    const amount = Number(whole);
    if (Number.isSafeInteger(amount) && amount > 0) {
      return { amount, sign: sign === "-" ? "negative" : sign === "+" ? "positive" : "unknown", hasNonZeroFraction: Boolean(fraction && Number(fraction) > 0) };
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const monthName = text.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i);
  if (monthName) return makeDateKey(Number(monthName[3]), monthNumbers[monthName[2].toLowerCase()], Number(monthName[1]));
  const monthFirst = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (monthFirst) return makeDateKey(Number(monthFirst[3]), monthNumbers[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    return makeDateKey(year, Number(numeric[2]), Number(numeric[1]));
  }
  return undefined;
}

function makeDateKey(year: number, month: number, day: number): string | undefined {
  if (!year || !month || !day) return undefined;
  const date = localDateFromKey(`${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return undefined;
  return dateKey(date);
}

function extractTime(text: string): string | undefined {
  const labeledLine = text.split("\n").find((line) => /(time|date|transaction|payment)/i.test(line) && /\d{1,2}:\d{2}/.test(line));
  const target = labeledLine ?? text;
  const match = target.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3];
  const period = match[4]?.toUpperCase();
  if (minutes > 59 || (seconds && Number(seconds) > 59) || hours > 23) return undefined;
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const minuteValue = `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
  return seconds ? `${minuteValue}:${seconds}` : minuteValue;
}

function extractMerchant(text: string): string | undefined {
  const line = text.split("\n").map((item) => item.trim()).find((item) => /^(paid to|pay to|to|merchant|merchant name|receiver|recipient|transfer to|received from)\b/i.test(item));
  if (!line) return undefined;
  const value = line.replace(/^(paid to|pay to|to|merchant name|merchant|receiver|recipient|transfer to|received from)\s*:?\s*/i, "").trim();
  return value || undefined;
}

function extractReference(text: string): string | undefined {
  const labeled = extractField(text, ["Transaction No", "Transaction Number", "Transaction ID", "Transaction Ref", "Reference", "Ref"]);
  if (labeled) {
    const value = labeled.match(/\b[A-Z0-9-]{6,}\b/i)?.[0];
    if (value) return value;
  }
  return text.match(/\b(?:transaction\s*(?:id|no|number|ref(?:erence)?)|reference|ref)\s*:?\s*([A-Z0-9-]{6,})\b/i)?.[1]
    ?? text.match(/\b\d{12,}\b/)?.[0];
}

function extractTransactionDateTime(text: string): { date: string; time: string } | undefined {
  const value = extractField(text, ["Transaction Time", "Transaction Date", "Payment Time", "Date Time"]);
  if (!value) return undefined;
  const match = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
  if (!match) return undefined;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = makeDateKey(year, Number(match[2]), Number(match[1]));
  if (!date) return undefined;
  const time = extractTime(match[0]);
  return time ? { date, time } : undefined;
}

function extractCounterparty(text: string): { name: string; maskedAccount?: string } | undefined {
  const value = extractField(text, ["Transfer To", "Paid To", "Pay To", "Merchant Name", "Merchant", "Receiver", "Recipient", "Received From", "Transfer From"])
    ?? text.split("\n").find((line) => /\([*xX0-9]{4,}\)/.test(line));
  if (!value) return undefined;
  const masked = value.match(/\(([*xX0-9]+)\)/)?.[1];
  const name = value.replace(/\s*\([*xX0-9]+\)\s*$/, "").trim();
  return { name: name || value, maskedAccount: masked };
}

function extractTransactionType(text: string): string | undefined {
  return extractField(text, ["Transaction Type"])
    ?? text.split("\n").find((line) => /^(transfer|payment|cash in|cash out|received)$/i.test(line.trim()));
}

function extractNote(text: string): string | undefined {
  return extractField(text, ["Notes", "Note"])
    ?? text.split("\n").find((line) => /family\s*&\s*friends/i.test(line));
}

function extractField(text: string, labels: string[]): string | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const sameLine = new RegExp(`^${escaped}\\s*:?\\s+(.+)$`, "i");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(sameLine);
      if (match?.[1]) return match[1].trim();
      if (new RegExp(`^${escaped}\\s*:?$`, "i").test(line)) {
        const next = lines[index + 1];
        if (next && !looksLikeLabel(next)) return next.trim();
      }
    }
  }
  return undefined;
}

function looksLikeLabel(value: string): boolean {
  return /^(transaction time|transaction no|transaction number|transaction type|transfer to|transfer from|paid to|received from|amount|notes?)\b/i.test(value);
}

function detectDirection(text: string, amount?: ParsedAmount): "outgoing" | "incoming" | "unknown" {
  if (/(received from|transfer from|cash received|incoming|receive successful)/i.test(text)) return "incoming";
  if (/(transfer to|payment successful|paid to|sent to|sent|purchase|pay to|merchant)/i.test(text)) return "outgoing";
  if (amount?.sign === "negative") return "outgoing";
  if (amount?.sign === "positive") return "incoming";
  return "unknown";
}
