import type { Account, Category, Settings } from "../types/finance";

export const defaultAccounts: Account[] = [
  {
    id: "cash",
    systemIdentifier: "cash",
    name: "Cash",
    type: "cash",
    icon: "cash",
    createdAt: "2026-01-01",
    isActive: true
  },
  {
    id: "kbzpay",
    systemIdentifier: "kbzpay",
    name: "KBZPay",
    type: "mobileWallet",
    icon: "kbzpay",
    createdAt: "2026-01-01",
    isActive: true
  }
];

export const defaultExpenseCategories: Category[] = [
  ["food", "Food", "fork"],
  ["transport", "Transport", "car"],
  ["shopping", "Shopping", "bag"],
  ["bills", "Bills", "receipt"],
  ["health", "Health", "heart"],
  ["entertainment", "Entertainment", "play"],
  ["family", "Family", "home"],
  ["education", "Education", "book"],
  ["business", "Business", "briefcase"],
  ["other-expense", "Other", "dots"]
].map(([id, name, icon]) => ({
  id,
  name,
  icon,
  type: "expense",
  createdAt: "2026-01-01",
  isDefault: true
}));

export const defaultIncomeCategories: Category[] = [
  ["salary", "Salary", "paycheck"],
  ["business-income", "Business Income", "briefcase"],
  ["gift", "Gift", "gift"],
  ["refund", "Refund", "return"],
  ["other-income", "Other Income", "dots"]
].map(([id, name, icon]) => ({
  id,
  name,
  icon,
  type: "income",
  createdAt: "2026-01-01",
  isDefault: true
}));

export const defaultSettings: Settings = {
  id: "settings",
  onboardingCompleted: false,
  theme: "system"
};
