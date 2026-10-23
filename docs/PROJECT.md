# Trackash self-hosted: project handoff

Read this first if you are picking up the project, human or coding agent. It explains **why**
the project exists and what has been decided. [AGENTS.md](../AGENTS.md) covers how the code is
organized and its rules, and [SETUP.md](SETUP.md) covers how to install an instance. When this file
and the code disagree, the code wins; fix this file in the same change.

## 1. Intent

Trackash started as one person's private dashboard. They wanted to see their whole financial life
(banks, credit cards, investments) in one place, with analytics the bank apps and Pluggy's own
dashboard don't offer, and with security strong enough to hold real financial data.

This repository is the **open-source, self-hosted edition** of that app:

- anyone in Brazil can run it **on their own computer**, with their own Pluggy credentials
  (Meu Pluggy, free for personal use);
- there is **no central server, no cloud database and no SaaS**: the data stays in a SQLite file on
  the owner's machine, and the maintainers never see anyone's data;
- the code is **generic**: no person, bank, amount or account of the original owner, anywhere;
- it is **lean on purpose**: one process, one local file, one guided setup. The cloud database
  (Supabase), sign-in with 2FA, the crypto module (Binance) and the AI contribution advisor were
  removed in October 2026 to keep the install simple (see the decisions log).

The private original stays a separate repository. This edition was created from a clean copy,
with fresh git history.

### Current status of the repository

- GitHub: `nathansouz4/trackash-selfhosted`, **private**, with a fresh history that starts at the
  local edition (v0, 2026-10-22). The history of the previous Supabase-based edition is archived
  in a separate private repository; development continues here.
- Do not make this repository public without the owner's explicit decision.
- Next: test a full install from scratch on a clean machine and keep checking that nothing
  personal is added.

## 2. Users and requirements

**Target user:** a person in Brazil, comfortable running two terminal commands and following a
guided setup (creating a Pluggy account, copying keys and ids), who wants a private dashboard of
their own finances.

### Functional requirements

| Area           | Requirement                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup          | Step-by-step first run: Meu Pluggy, Pluggy credentials (tested), item ids (checked), optional B3 statement, first sync with visible progress     |
| Data ingestion | Read-only bank, credit card and investment data from Pluggy (up to 5 connections); manual item ids (Pluggy doesn't list Meu Pluggy items)        |
| Sync           | Background sync with progress; automatic on app open when older than 6h; header button; `npm run sync` for schedules; one at a time              |
| Overview       | Net worth = bank balances + investments (card debt not subtracted); balance history rebuilt backwards from the current balance                   |
| Cash flow      | All money in/out per month, categorized; no double counting (bill payments, own transfers and investment movements excluded from spending)       |
| Cards          | Open bill from unbilled transactions, closed bills, installment plans, future commitments; duplicated cards (bank + issuer) merged automatically |
| Investments    | Positions, TWR, volatility, concentration, health radar (5 scores); B3 statement import for stock/FII cost and income; per-position liquidity    |
| Privacy        | One-click blur of every amount; theme and privacy preferences applied before first paint                                                         |

### Non-functional requirements

- **Security first.** Never weaken a layer of the security model (AGENTS.md) to make something
  work. Propose the change and ask first. Without sign-in, the boundary is the machine: localhost
  only, a private database file.
- **Single user per instance**: whoever runs it.
- **Data minimization**: store only what a screen needs: no CPF/CNPJ, last 4 digits of accounts,
  counterparty display names only.
- **Language:** everything in English (code, files, routes, docs, commits, database objects)
  except **user-facing UI copy, which is pt-BR**.
- **Pure, tested business rules** in `src/lib` (Vitest, `America/Sao_Paulo`); read models and the
  sync tested against an in-memory database.
- **Zero cost:** Pluggy personal use, nothing else.

## 3. Architecture in one page

```
browser ── http://localhost ──> TanStack Start server (Node 22, on the owner's machine)
                                 ├─ local-only host check, CSP, CSRF (src/start.ts)
                                 ├─ SQLite file data/trackash.db (better-sqlite3, migrations on open)
                                 ├─ Pluggy API (read-only; API key in memory)
                                 └─ background sync job (progress polled by the screens)
terminal ── npm run sync / import-b3 / check-pluggy ──> same server code, same database
```

- **One database file** with the data, the B3 statements, the sync history and the Pluggy
  credentials (`settings`). Migrations live in `src/backend/migrations` and are tracked with
  `PRAGMA user_version`.
- **No browser access to the database**: everything goes through server functions.
- **Scripts** load the app's TypeScript server code through Vite (`scripts/lib/server-modules.mjs`),
  so the terminal and the app share one implementation.

## 4. Decisions log (keep it updated)

| Decision                                                              | Why                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AGPL-3.0                                                              | anyone hosting a modified version for others must share the source; keeps the project open             |
| New repository with clean history (not a fork of the private app)     | the private history contains personal data and decisions                                               |
| Local SQLite instead of Supabase (2026-10)                            | financial data stays on the owner's disk; no cloud account, no network database, a two-command install |
| No sign-in; localhost only with a Host check (2026-10)                | a single local user doesn't need accounts or 2FA; the Host check blocks DNS rebinding                  |
| Pluggy credentials in the database, API key only in memory (2026-10)  | one place for everything the instance knows; nothing to edit by hand; no `.env` needed                 |
| Crypto (Binance) and the AI advisor removed (2026-10)                 | keep the edition lean; the core is Open Finance data + B3 statement analytics                          |
| Sync in the background with polled progress; `npm run sync` (2026-10) | the first load takes minutes; the owner sees what's happening; schedules work without the app open     |
| B3 statement import kept as a first-class feature                     | Pluggy has no purchase history: without it, stocks/FIIs have no average cost, result or income history |
| Card debt not subtracted from net worth                               | bills are treated as paid from recurring income; the cards page shows the debt                         |
| Duplicated cards: keep the issuer's copy                              | the issuer's connection has the richer card data; the owner can override per account                   |

## 5. Rules for whoever continues

- **No personal data, ever:** no real e-mails, names, CPF, amounts, account numbers, item ids
  or account ids, in code, fixtures, migrations, docs or commits. Fixtures
  use made-up values (`BANCO EXEMPLO`, `LOJA EXEMPLO`, `FULANA DE TAL`, last 4 `0000`).
  Public reference data (B3 tickers, bank codes, Pluggy connector names) is fine.
- **Never commit** `.env`, `data/` (the database lives there), `*.db` files or local editor/agent
  settings. Before committing, scan the staged diff for secrets.
- **Never write destructive migrations** (DROP, data deletes) without the owner's approval. Never
  edit a released migration; add a new one.
- **Commits:** Conventional Commits, small and focused. Author is the maintainer. The owner asked
  for **no AI co-author trailers**.
- **Checks before pushing:** `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.

## 6. Status (2026-10-22)

Done in this edition:

- Supabase replaced by a local SQLite database (`better-sqlite3`), with its own migration baseline
  (`src/backend/migrations/0001_initial.sql`).
- Sign-in, 2FA, the one-time setup code and the `.env` writer removed; the app answers on localhost
  only.
- Crypto (Binance), the AI advisor, the Python market data pipelines and the Netlify deploy removed.
- New guided setup (`/setup`) with the first sync's progress; background sync with automatic
  refresh on open; `npm run sync`, `npm run import-b3`, `npm run check-pluggy`.
- B3 statement import kept (setup step, Investments page, terminal).

Not yet verified:

- A **full install from zero** on a clean machine with a real Meu Pluggy account, following
  SETUP.md exactly. Tests cover the sync against a fake Pluggy API, not the live one.
- Data from the previous Supabase-based edition is not migrated: an existing owner re-syncs (up to
  2 years of transactions) and re-imports the B3 statements; older daily portfolio snapshots stay
  in the old project.

## 7. Roadmap

1. **Release gate**: install from zero; a final personal-data audit (`git grep` for names,
   e-mails, ids, amounts) before each release.
2. Repository hygiene: CONTRIBUTING, SECURITY.md (how to report vulnerabilities), issue templates,
   CI (typecheck, test, lint, build).
3. Optional one-off import of an old Supabase-edition database (snapshots history).
4. Backup/export from the settings screen.
5. Possibly English UI copy as a second locale (today pt-BR only).
