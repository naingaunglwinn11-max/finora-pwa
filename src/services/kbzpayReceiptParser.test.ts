import { describe, expect, it } from "vitest";
import { normalizeMerchantName, parseKBZPayReceipt, suggestedTypeForReceipt, suggestCategoryIdForMerchant } from "./kbzpayReceiptParser";
import type { Category } from "../types/finance";

const categories: Category[] = [
  { id: "food", name: "Food", type: "expense", icon: "fork", createdAt: "2026-01-01", isDefault: true },
  { id: "transport", name: "Transport", type: "expense", icon: "car", createdAt: "2026-01-01", isDefault: true },
  { id: "shopping", name: "Shopping", type: "expense", icon: "bag", createdAt: "2026-01-01", isDefault: true },
  { id: "family", name: "Family", type: "expense", icon: "home", createdAt: "2026-01-01", isDefault: true },
  { id: "other-expense", name: "Other", type: "expense", icon: "dots", createdAt: "2026-01-01", isDefault: true },
  { id: "other-income", name: "Other Income", type: "income", icon: "dots", createdAt: "2026-01-01", isDefault: true }
];

describe("KBZPay receipt parser", () => {
  it("extracts outgoing receipt fields", () => {
    const result = parseKBZPayReceipt(`KBZPay
Payment Successful
Amount 15,000 MMK
Paid To KFC
16 Sep 2026
Transaction Time 8:31 PM
Transaction ID ABC123456`);

    expect(result.amount).toBe(15000);
    expect(result.date).toBe("2026-09-16");
    expect(result.time).toBe("20:31");
    expect(result.merchant).toBe("KFC");
    expect(result.transactionReference).toBe("ABC123456");
    expect(result.direction).toBe("outgoing");
    expect(suggestedTypeForReceipt(result)).toBe("expense");
    expect(suggestCategoryIdForMerchant(result.merchant, categories, "expense")).toBe("food");
  });

  it("extracts incoming receipts as income", () => {
    const result = parseKBZPayReceipt(`KBZPay
Cash Received
Received 100,000 Ks
Received From Someone
16/09/2026
20:31`);

    expect(result.amount).toBe(100000);
    expect(result.date).toBe("2026-09-16");
    expect(result.time).toBe("20:31");
    expect(result.direction).toBe("incoming");
    expect(suggestedTypeForReceipt(result)).toBe("income");
  });

  it("extracts real KBZPay e-receipt transfer fields as an expense", () => {
    const result = parseKBZPayReceipt(`KBZ BANK
E-Receipt
-10.00 Ks
Transaction Time 16/09/2026 20:50:09
Transaction No 01004276060969302536
Transaction Type Transfer
Transfer To Aye Thandar Aung (******5195)
Amount -10.00 Ks
Notes Family & Friends
KBZPay
Thank you for using KBZPay!`);

    expect(result.amount).toBe(10);
    expect(result.direction).toBe("outgoing");
    expect(suggestedTypeForReceipt(result)).toBe("expense");
    expect(result.date).toBe("2026-09-16");
    expect(result.time).toBe("20:50:09");
    expect(result.transactionReference).toBe("01004276060969302536");
    expect(result.externalTransactionType).toBe("Transfer");
    expect(result.merchant).toBe("Aye Thandar Aung");
    expect(result.recipient).toBe("Aye Thandar Aung");
    expect(result.recipientMaskedAccount).toBe("******5195");
    expect(result.note).toBe("Family & Friends");
    expect(suggestCategoryIdForMerchant(`${result.merchant} ${result.note}`, categories, "expense")).toBe("family");
  });

  it("supports split label and value lines from two-column OCR", () => {
    const result = parseKBZPayReceipt(`KBZ BANK
E-Receipt
Transaction Time
16/09/2026 20:50:09
Transaction No
01004276060969302536
Transaction Type
Transfer
Transfer To
Aye Thandar Aung (******5195)
Amount
-10.00 Ks
Notes
Family & Friends
KBZPay`);

    expect(result.amount).toBe(10);
    expect(result.date).toBe("2026-09-16");
    expect(result.time).toBe("20:50:09");
    expect(result.transactionReference).toBe("01004276060969302536");
    expect(result.merchant).toBe("Aye Thandar Aung");
    expect(result.note).toBe("Family & Friends");
    expect(result.direction).toBe("outgoing");
  });

  it("handles OCR output when receipt labels are missed", () => {
    const result = parseKBZPayReceipt(`A KBZ BANK E-Receipt
- 1 0 ° 00 Ks
16/09/2026 20:50:09
01004276060969302536
Transfer
Aye Thandar Aung (******5195)
-10.00 Ks
Family & Friends
Tol pe Md EE
KBZ Jl ii
Eanes: Thank you for using KBZPay!
fo tea
Scan to verify payment`);

    expect(result.amount).toBe(10);
    expect(result.date).toBe("2026-09-16");
    expect(result.time).toBe("20:50:09");
    expect(result.transactionReference).toBe("01004276060969302536");
    expect(result.externalTransactionType).toBe("Transfer");
    expect(result.merchant).toBe("Aye Thandar Aung");
    expect(result.recipientMaskedAccount).toBe("******5195");
    expect(result.note).toBe("Family & Friends");
    expect(result.direction).toBe("outgoing");
  });

  it("normalizes merchant names", () => {
    expect(normalizeMerchantName("  Grab   Myanmar! ")).toBe("grab myanmar");
  });
});
