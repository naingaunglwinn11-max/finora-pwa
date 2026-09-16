export type AccountId = "cash" | "kbzpay";
export type TransactionType = "income" | "expense" | "transfer" | "openingBalance";
export type CategoryType = "income" | "expense";
export type ThemePreference = "system" | "light" | "dark";

export interface Account {
  id: AccountId;
  systemIdentifier: AccountId;
  name: string;
  type: "cash" | "mobileWallet";
  icon: string;
  createdAt: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  createdAt: string;
  isDefault: boolean;
}

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: AccountId;
  destinationAccountId?: AccountId;
  categoryId?: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: "settings";
  onboardingCompleted: boolean;
  theme: ThemePreference;
  lastBackupAt?: string;
  storagePersisted?: boolean;
}

export interface FinoraBackup {
  backupVersion: 1;
  createdAt: string;
  accounts: Account[];
  categories: Category[];
  transactions: FinanceTransaction[];
  settings: Settings;
}
