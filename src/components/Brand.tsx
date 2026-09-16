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
      MMK
    </span>
  );
}
