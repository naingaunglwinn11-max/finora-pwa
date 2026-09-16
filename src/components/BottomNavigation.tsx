import type { Tab } from "../app/App";

const items: Array<{ tab: Tab; label: string; icon: string }> = [
  { tab: "dashboard", label: "Dashboard", icon: "⌂" },
  { tab: "transactions", label: "Transactions", icon: "☰" },
  { tab: "accounts", label: "Accounts", icon: "▣" },
  { tab: "settings", label: "Settings", icon: "⚙" }
];

export function BottomNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map((item) => (
        <button key={item.tab} type="button" className={activeTab === item.tab ? "active" : ""} onClick={() => onChange(item.tab)}>
          <span aria-hidden="true">{item.icon}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </nav>
  );
}
