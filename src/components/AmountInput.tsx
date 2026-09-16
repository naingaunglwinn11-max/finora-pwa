import { formatAmountInput } from "../utils/currency";

export function AmountInput({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="amount-entry">
      <span>Amount</span>
      <input
        autoFocus={autoFocus}
        inputMode="numeric"
        pattern="[0-9,]*"
        placeholder="0"
        value={value}
        onChange={(event) => onChange(formatAmountInput(event.target.value))}
        aria-label="Amount in MMK"
      />
      <em>MMK</em>
    </label>
  );
}
