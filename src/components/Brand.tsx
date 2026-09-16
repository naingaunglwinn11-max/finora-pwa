import finoraMark from "../assets/branding/finora-mark.png";
import kbzPayLogo from "../assets/branding/kbzpay-logo.png";
import type { Account } from "../types/finance";

export function FinoraMark({ size = 42 }: { size?: number }) {
  return <img className="brand-mark" src={finoraMark} alt="Finora" style={{ width: size, height: size }} />;
}

export function AccountIcon({ account, size = 38 }: { account: Account; size?: number }) {
  if (account.id === "kbzpay") {
    return <img className="account-logo" src={kbzPayLogo} alt="KBZPay" style={{ width: size, height: size }} />;
  }
  return (
    <span className="account-symbol" aria-label="Cash" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6.5" width="17" height="11" rx="2.4" />
        <path d="M6.7 9.6h2.4" />
        <path d="M14.9 14.4h2.4" />
        <circle cx="12" cy="12" r="2.75" />
      </svg>
    </span>
  );
}
