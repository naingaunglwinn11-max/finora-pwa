import { AccountIcon } from "./Brand";
import type { Account, AccountId } from "../types/finance";
import { formatMMK } from "../utils/currency";

export function AccountSelector({
  accounts,
  selected,
  balances,
  onChange
}: {
  accounts: Account[];
  selected: AccountId;
  balances: Record<AccountId, number>;
  onChange: (id: AccountId) => void;
}) {
  return (
    <div className="account-selector">
      {accounts.map((account) => (
        <button key={account.id} type="button" className={selected === account.id ? "selected" : ""} onClick={() => onChange(account.id)}>
          <AccountIcon account={account} size={34} />
          <span>{account.name}</span>
          <small>{formatMMK(balances[account.id])}</small>
        </button>
      ))}
    </div>
  );
}
