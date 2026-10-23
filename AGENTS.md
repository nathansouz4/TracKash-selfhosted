# Agent guide

Entry point for any coding agent and for humans. Read this whole file before changing code. The
why behind the project (vision, requirements, decisions, status, roadmap) is in
[docs/PROJECT.md](docs/PROJECT.md); installing an instance is in [docs/SETUP.md](docs/SETUP.md).

## Product

**Trackash (self-hosted edition)** — open-source personal finance dashboard that runs **on the
owner's own machine**. Each instance belongs to **a single user** (whoever runs it), with their own
Pluggy credentials. It reads bank accounts, credit cards and investments through the Pluggy API
(Meu Pluggy, personal use: read-only, up to 5 bank connections), stores everything in a **local
SQLite file** and adds what Pluggy's own dashboard lacks: spending analytics, cash flow, card bills
and portfolio performance statistics (with the B3 statement for stocks and FIIs). End-user UI copy
is **pt-BR**. License: AGPL-3.0.

There is no cloud database, no sign-in and no hosting target: `npm run dev` (or `npm run build` +
`npm start`) on the owner's computer, `http://localhost`.

Nothing in the code may be specific to one person: no e-mails, names, banks "of the owner",
amounts or ids in code, tests, fixtures, migrations or docs. Fixtures use made-up values
(`BANCO EXEMPLO`, `LOJA EXEMPLO`, last 4 `0000`).

## Engineering principles

- **Everything is in English**: identifiers, file and folder names, route URLs and search params,
  comments, docs, commit messages, database objects. The only exception is **user-facing UI copy**
  (labels, toasts, error messages shown to the user), which is pt-BR.
- Routes: `/` overview, `/cash-flow` (all money in/out, incl. Pix and bank debits), `/cards` (credit
  card analysis, `?card=` filter), `/investments`, `/connections`, `/settings` (Pluggy credentials,
  where the data lives), `/setup` (first run). Month-based pages take `?month=YYYY-MM`.
- Business rules live in `src/lib` as pure, tested functions (`*.test.ts`, Vitest, `America/Sao_Paulo`).
  Server read models and the sync are tested against an in-memory database
  (`src/backend/*.server.test.ts`, fake Pluggy API).
- Keep it lean: the edition dropped the cloud database, sign-in, crypto and the AI advisor on
  purpose. Ask before bringing any of that back.
- Small, focused commits following Conventional Commits.

## Security model (read before touching data or the server)

The data is sensitive even though Pluggy is read-only. The boundary is the owner's machine:

1. **Local only, no sign-in**: the app belongs to whoever runs it. Vite binds to `localhost`, and the
   `localOnlyMiddleware` in `src/start.ts` refuses any request whose `Host` is not a loopback name
   (stops DNS rebinding: a web page pointing its domain at 127.0.0.1). Never bind to other
   interfaces or add an "allowed hosts" escape hatch without adding authentication first.
2. **Local data**: one SQLite file (`data/trackash.db`, or `TRACKASH_DB_PATH`), created with mode 600
   (folder 700). It holds the financial data and the Pluggy client id/secret (`settings` table).
   `data/` and `*.db` are git-ignored. There is no browser access to the database: every read and
   write goes through server functions.
3. **Pluggy API key** (valid ~2h): kept in memory only (`globalThis`), reused until 10 min before
   expiry, re-issued on 401/403 and when the credentials change. Credentials are tested against
   Pluggy before being saved; screens only learn whether they are set, never their values.
4. **Data minimization**: no CPF/CNPJ, only the last 4 digits of account numbers, only the
   counterparty's display name from payment data.
5. **HTTP**: strict CSP with a per-request nonce (`src/start.ts` + `src/router.tsx`), frame denial,
   `no-store` on everything, CSRF middleware on server functions, `noindex`. Inline scripts must go
   through `ScriptOnce` (it carries the nonce), never raw `<script>`.
6. **Privacy mode** (eye toggle in the header): wrap every amount in `<Money>` or `<Sensitive>` so it
   blurs; chart axes/tooltips blur automatically. Preference + theme live in localStorage and are applied
   before first paint by `PREFERENCES_BOOT_SCRIPT` (`src/lib/preferences.ts`).
7. **Bundles**: server code lives in `src/backend/*.server.ts`; `importProtection` in `vite.config.ts`
   fails the build if the client imports it. No source maps in production.

Never weaken one of these layers to make something work; ask first.

## Stack

- TanStack Start (React 19, Vite 8, TanStack Router + Query), Tailwind v4 + shadcn/ui, Recharts.
- SQLite through `better-sqlite3` (synchronous; native module kept external in the SSR build).
- Node 22 (`.nvmrc`) and npm.

## Folders

```
src/
  routes/                  file-based routes
    setup.tsx              first-run guide: Meu Pluggy, credentials, item ids, B3 statement, first sync
    _app/                  guard (setup done?) + overview, cash-flow, cards, investments, connections, settings
  functions/               createServerFn endpoints (*.functions.ts) + query options (queries.ts)
  backend/                 server-only (*.server.ts): db (SQLite + migrations/), settings, Pluggy client,
                           sync, read models (queries), B3 import, setup state
    migrations/            NNNN_name.sql, applied when the database opens (PRAGMA user_version)
  lib/                     pure rules: spending, investments (TWR, risk, concentration), B3, dates, format
  components/              AppLayout, brand (logo), charts, dashboard pieces, SyncProgress,
                           transactions (list + month nav), setup/ (Pluggy forms), ui/ (shadcn)
  hooks/                   client hooks (sync status + start, privacy mode, theme)
  start.ts                 global middlewares: error page, local-only host check, security headers + CSP nonce, CSRF
scripts/                   sync.mjs, import-b3.mjs, check-pluggy.mjs (+ lib/server-modules.mjs: loads the
                           app's server code through Vite)
docs/                      PROJECT.md (handoff: intent, requirements, decisions), SETUP.md (install guide)
data/                      the local database and personal exports (git-ignored)
```

## Commands

| Command                                  | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                            | dev server at http://localhost:3000; the first visit opens the setup          |
| `npm run build` + `npm start`            | production build served at http://localhost:4173                              |
| `npm run sync`                           | full sync from the terminal (same as the app's button; good for a daily cron) |
| `npm run import-b3 -- <file.xlsx> [...]` | imports B3 movement statements                                                |
| `npm run check-pluggy [-- itemId]`       | saved credentials → API key → real API call (no output of secrets)            |
| `npm test`                               | unit tests (`src/lib`) and server tests over an in-memory database            |
| `npm run typecheck` / `lint`             | TypeScript / ESLint + Prettier                                                |

## Environment

- No `.env` is needed. The Pluggy credentials are entered in the setup (or `/settings`) and stored
  in the database. `.env` (optional, git-ignored, format in `.env.example`) only overrides
  `TRACKASH_DB_PATH`; `npm start` and the scripts read it when present.
- `data/` holds the database and personal exports (B3 statements). Git-ignored; never commit it.
- To start over: stop the app and delete the database file (and its `-wal`/`-shm` files).

## Data notes

- Pluggy category ids are hierarchical (`03060000` "dividends" under `03000000` "investments"); grouping
  and classification use the 2-digit prefix (`src/lib/spending.ts`).
- Spending = card purchases (net of refunds) + bank debits, excluding bill payments, transfers between
  own accounts and investment movements, so nothing is counted twice.
- Portfolio history comes from `investment_snapshots`, one per position per sync day. Sync daily for
  meaningful TWR/volatility. Meu Pluggy items refresh on Pluggy's side every 24h.
- `GET /items` does not list Meu Pluggy items (401; `/v2/items` 403): item ids are entered by the owner
  in Connections.
- Bank balance history (overview) is rebuilt backwards from the current balance (`src/lib/balances.ts`).
- Net worth = bank balances + investments. Card debt is NOT subtracted (product decision: bills are
  treated as paid from recurring income; the cards page shows the debt on its own).
- Credit cards (`src/lib/cards.ts`): Pluggy's card `balance` is the used limit (open bill + future
  installments) and its due date is the last closed bill's. The open bill is computed from unbilled
  transactions (`bill_id` null) between the last closing date and the next. Installment plans group
  one purchase's installments; some banks list future installments with future dates, others only
  once billed.
- Meu Pluggy items all report connector "MeuPluggy"; the real bank comes from the accounts' bank code
  and Pluggy's connector catalog (`src/lib/institutions.ts`), stored in `pluggy_items.institution_*`.
  Card-only connections (card issuers) have no bank code: the owner picks the institution in
  Connections, which sets `institution_locked` so the sync stops inferring it.
- Duplicated cards: the same card (last 4 + brand) can come from the bank's connection and the card
  issuer's. Rule: keep the issuer's copy (connection with only cards) and mark the
  other `accounts.ignored = 1, ignored_by = 'auto'` (`src/lib/duplicates.ts`, re-evaluated each
  sync). The owner can ignore/restore any account (`ignored_by = 'user'`, never overridden). Every read
  model must exclude ignored accounts.
- Sync (`src/backend/sync.server.ts`) runs in the background of the server process and the screens
  poll its progress (`getSyncStatus`, every second while it runs). It starts from the setup's last
  step, from the header button, and on its own when the app opens and the last successful sync is
  older than 6h. `npm run sync` runs the same load in the foreground. One sync at a time across
  both: the guard is the latest `sync_runs` row (its `pid` tells a dead process's run apart).
  Investment movements are fetched with bounded concurrency. The first sync looks back 730 days;
  later ones re-read the last 45 days (pending → posted transactions change ids).
- The client caches pages for 5 min, preloads on hover and prefetches all tabs after the first load.

## Variable income and the B3 statement

- Pluggy (Open Finance brokers) gives current positions (quantity + price) of stocks, FIIs, ETFs and
  BDRs, but not the purchase history; only recent income/buys show up in investment transactions.
- The B3 movement statement (Área do Investidor → Extratos → Movimentação, .xlsx) fills the gap:
  uploaded in the setup (optional step), on the Investments page or with
  `npm run import-b3 -- <file.xlsx> [...]`; stored in `b3_movements` (rows hashed → re-imports are
  idempotent). Exports live in `data/` (ignored).
- Rules in `src/lib/b3.ts` (parsing), `src/lib/equities.ts` (aliases, average cost, income, holdings)
  and `src/lib/b3-assets.ts` (class/sector; overrides Pluggy, which labels some FIIs as stocks).
  Share classes of one company (ITUB3/ITUB4) share a B3 name and must never be merged.
- Pluggy movements dated after the last imported statement are added on top (buys → cost, income).
- Pluggy webhooks have no investment events and carry only ids; `item/updated` could trigger a sync.

## Build gotcha

`vite.config.ts` puts the Start runtime in its own SSR chunk (`start-runtime`). Without it the
production server crashes with `createServerFn is not a function` (chunk cycle). Don't remove it.

## Database changes

New file in `src/backend/migrations` named `NNNN_name.sql` with the next number; it runs once, in a
transaction, when the database opens, and `PRAGMA user_version` records it. Never edit a released
migration (instances have applied it): add a new one. SQLite conventions (see `0001_initial.sql`):
timestamps as ISO 8601 UTC text (`isoTimestamp`, so they compare as strings), dates as
`YYYY-MM-DD`, booleans 0/1, JSON as text, amounts `real`. Foreign keys are on
(`PRAGMA foreign_keys`): removing a connection cascades to everything imported from it.
Migrations must never contain personal data.
