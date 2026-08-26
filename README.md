# Andes Manager

Andes Manager is a React dashboard for tracking laundry operations across B2B hostel batches and B2C customer orders. Data is stored in Firebase and updates in real time.

## Run the website

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Using the dashboard

- Use **B2B Hostels** to log, edit, process, and review hostel laundry batches.
- Use **B2C Orders** to log and manage individual customer orders, payments, delays, refunds, and repeat customers.
- Use the filters and search controls to find delayed, flagged, pending-review, or completed records.
- Select the lock icon and sign in with an approved Andes admin account to view the overview and access admin-only actions.
- Sign out with the user control in the top navigation.

## Checks and production build

```bash
npm run lint
npm run build
```

The production files are generated in `dist/`. Firebase authentication and Firestore rules must be configured in the connected Firebase project before deploying for real use.
