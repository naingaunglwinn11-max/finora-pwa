import type { Tab } from "../app/App";

type NavItem = { kind: "tab"; tab: Tab; label: string; icon: IconName } | { kind: "add"; label: string; icon: IconName };
type IconName = "home" | "history" | "plus" | "insights" | "settings";

const items: NavItem[] = [
  { kind: "tab", tab: "dashboard", label: "Dashboard", icon: "home" },
  { kind: "tab", tab: "transactions", label: "Transactions", icon: "history" },
  { kind: "add", label: "Add", icon: "plus" },
  { kind: "tab", tab: "insights", label: "Insights", icon: "insights" },
  { kind: "tab", tab: "settings", label: "Settings", icon: "settings" }
];

export function BottomNavigation({ activeTab, onChange, onAdd }: { activeTab: Tab; onChange: (tab: Tab) => void; onAdd: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map((item) => (
        <button
          key={item.kind === "tab" ? item.tab : "add"}
          type="button"
          className={`${item.kind === "tab" && activeTab === item.tab ? "active" : ""} ${item.kind === "add" ? "nav-add" : ""}`}
          onClick={() => item.kind === "tab" ? onChange(item.tab) : onAdd()}
          aria-label={item.kind === "add" ? "Add Transaction" : item.label}
        >
          {item.kind === "add" ? <span className="nav-add-circle"><Icon name={item.icon} /></span> : <Icon name={item.icon} />}
          <strong>{item.label}</strong>
        </button>
      ))}
    </nav>
  );
}

function Icon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === "home" && <><path {...common} d="M3 10.8 12 3l9 7.8" /><path {...common} d="M5.5 10.5V21h13V10.5" /><path {...common} d="M9.5 21v-6h5v6" /></>}
      {name === "history" && <><path {...common} d="M4 6h16" /><path {...common} d="M4 12h16" /><path {...common} d="M4 18h10" /></>}
      {name === "plus" && <><path {...common} d="M12 5v14" /><path {...common} d="M5 12h14" /></>}
      {name === "insights" && <><path {...common} d="M5 19V9" /><path {...common} d="M12 19V5" /><path {...common} d="M19 19v-7" /></>}
      {name === "settings" && <><path {...common} d="M4 7h9" /><path {...common} d="M17 7h3" /><circle {...common} cx="15" cy="7" r="2" /><path {...common} d="M4 17h3" /><path {...common} d="M11 17h9" /><circle {...common} cx="9" cy="17" r="2" /></>}
    </svg>
  );
}
