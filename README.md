# Finora PWA

Finora PWA is an iPhone-first, local-first personal finance app for tracking Cash and KBZPay without Xcode signing, TestFlight, App Store distribution, login, or a backend.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

The production build is written to `dist/` and can be hosted on any static HTTPS host such as Cloudflare Pages, GitHub Pages, Netlify, or Vercel.

## Install On iPhone

1. Open the deployed Finora URL in Safari.
2. Tap Share.
3. Choose Add to Home Screen.
4. Enable Open as Web App if shown.
5. Tap Add.
6. Launch Finora from the Home Screen.

Service workers require HTTPS in production. Localhost is allowed for development.

## Data Storage

Financial records are stored in IndexedDB on the device in a database named `finoraDB`. Finora does not use a remote financial database, login, analytics, advertising, or third-party tracking.

Deleting Safari website data, removing the PWA, or resetting the phone may remove local data. Export backups regularly.

## Backups

Settings includes:

- Export Backup: downloads a `.finora` JSON backup.
- Restore Backup: validates a selected `.finora` file, shows a summary, then replaces current data after confirmation.
- Export Transactions CSV: exports transaction history as CSV.

Restoring validates the file before touching current data.
