import { describe, expect, it } from "vitest";
import type { FinanceTransaction } from "../types/finance";
import { findLikelyKBZPayDuplicate } from "./duplicateImportService";

const baseTransaction: FinanceTransaction = {
  id: "tx_1",
  type: "expense",
  amount: 15000,
  accountId: "kbzpay",
  categoryId: "food",
  date: "2026-09-16",
  transactionDateTime: "2026-09-16T20:31",
  note: "KFC",
  merchant: "KFC",
  source: "kbzpayReceipt",
  externalReference: "ABC123456",
  createdAt: "2026-09-16T14:01:00.000Z",
  updatedAt: "2026-09-16T14:01:00.000Z"
};

describe("KBZPay duplicate import detection", () => {
  it("matches receipt imports by transaction reference first", () => {
    const match = findLikelyKBZPayDuplicate({
      amount: 1,
      transactionDateTime: "2026-09-16T22:00",
      externalReference: "ABC123456"
    }, [baseTransaction]);

    expect(match?.id).toBe("tx_1");
  });

  it("matches likely duplicates by KBZPay amount, merchant, and nearby time", () => {
    const match = findLikelyKBZPayDuplicate({
      amount: 15000,
      transactionDateTime: "2026-09-16T20:37",
      merchant: "KFC"
    }, [{ ...baseTransaction, externalReference: undefined }]);

    expect(match?.id).toBe("tx_1");
  });

  it("does not match unrelated KBZPay receipts outside the time window", () => {
    const match = findLikelyKBZPayDuplicate({
      amount: 15000,
      transactionDateTime: "2026-09-16T21:00",
      merchant: "KFC"
    }, [{ ...baseTransaction, externalReference: undefined }]);

    expect(match).toBeNull();
  });
});
