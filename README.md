<p align="center">
  <img src="public/favicon.svg" alt="TracKash" width="96" height="96">
</p>

<h1 align="center">Trackash</h1>

<p align="center">
  Open-source personal finance dashboard for Brazil that runs on your own computer: bank accounts,
  credit cards and investments in one place,<br>with the analysis the bank apps don't give you.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL v3" src="https://img.shields.io/badge/license-AGPL--3.0-047857"></a>
  <img alt="Node 22" src="https://img.shields.io/badge/node-22-047857?logo=nodedotjs&logoColor=white">
  <img alt="TanStack Start" src="https://img.shields.io/badge/TanStack-Start-047857?logo=react&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-047857?logo=sqlite&logoColor=white">
  <img alt="Open Finance via Pluggy" src="https://img.shields.io/badge/Open%20Finance-Pluggy-047857">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-yes-555555">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#how-your-data-is-kept">Data</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#license">License</a>
</p>

---

You run Trackash on your own machine with your own Pluggy credentials (free for personal use). It
reads your bank accounts, credit cards and investments through Open Finance (Pluggy, read-only),
keeps everything in a local SQLite file and shows what the bank apps don't show together: where the
money goes, cash flow, credit card bills and installments, and how your investments perform,
including stock and FII average cost and income from the B3 statement.

The interface is in Brazilian Portuguese. The code and docs are in English.

## Features

| Page                           | What it shows                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** `/`               | Net worth (bank balances + investments), balance history, allocation, spending trend.                                                                                                                                      |
| **Cash flow** `/cash-flow`     | Every inflow and outflow by month, including Pix and bank debits, with categories. Transfers between your own accounts are not counted twice.                                                                              |
| **Cards** `/cards`             | Open bill computed from unbilled transactions, closed bills, installment plans and future commitments, per card. Duplicated cards (bank + issuer) are merged automatically.                                                |
| **Investments** `/investments` | Positions by class and institution, time-weighted return, volatility, concentration, a portfolio health radar (diversification, protection, efficiency, return, liquidity), and stock/FII average cost and income from B3. |
| **Connections** `/connections` | Your Meu Pluggy connections, their accounts (ignore any of them) and the sync history.                                                                                                                                     |

Plus **privacy mode**: one click blurs every amount on screen.

## How your data is kept

- **On your machine only.** Everything goes into one SQLite file (`data/trackash.db`), readable only
  by your user. There is no cloud database and no Trackash server: data moves only between your
  computer and Pluggy.
- **No account, no login.** The app answers only on `localhost` and refuses requests addressed to
  any other host name, so other devices and web pages can't reach it.
- **Read-only bank access.** Pluggy's personal plan can only read. The app keeps no CPF/CNPJ and
  only the last 4 digits of account numbers.
- **Locked-down HTTP.** Strict CSP with a per-request nonce, CSRF protection and `no-store` caching.

Details: [AGENTS.md](AGENTS.md#security-model-read-before-touching-data-or-the-server).

## Getting started

Requirements: Node 22 and npm, a [Meu Pluggy](https://meu.pluggy.ai) account with your banks
connected, and a free developer account at [dashboard.pluggy.ai](https://dashboard.pluggy.ai).

```bash
npm ci
npm run dev       # http://localhost:3000
```

Open the app: a step-by-step setup asks for your Pluggy Client ID and Secret, the id of each Meu
Pluggy connection and, optionally, your B3 statement, then loads up to two years of history while
showing its progress.

Afterwards the app refreshes the data whenever you open it (if the last sync is more than 6 hours
old) and from the sync button. `npm run sync` does the same from the terminal, handy for a daily
schedule. The full guide is in [docs/SETUP.md](docs/SETUP.md).

## Stack

TanStack Start (React 19, Vite, TanStack Router + Query), Tailwind v4 + shadcn/ui, Recharts and
SQLite (`better-sqlite3`).

## Documentation

- [docs/SETUP.md](docs/SETUP.md): installing and running Trackash.
- [docs/PROJECT.md](docs/PROJECT.md): intent, requirements, architecture, decisions and roadmap.
- [AGENTS.md](AGENTS.md): conventions, security model and data notes for contributors and coding
  agents.

## Disclaimer

> [!IMPORTANT]
> Trackash is a personal tool, **not investment advice**. Every decision, and its risk, is yours.

- Trackash is not affiliated with Pluggy, B3 or any bank. You use your own accounts on those
  services, under their terms.
- You are responsible for your copy: keep `data/` private (it holds your financial data and your
  Pluggy credentials), back it up, and keep dependencies up to date.

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version for other people
over a network, you must offer them its source code.
