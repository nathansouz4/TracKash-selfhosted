# Setting up Trackash

This guide takes you from zero to your dashboard on your own computer. Plan for about 10 minutes,
plus a few minutes for the first data load.

Trackash runs only on your machine. Your data moves only between your computer and Pluggy, and it is
stored in a single SQLite file in the project folder.

## 1. Prerequisites

| Tool         | Why                                      | Check           |
| ------------ | ---------------------------------------- | --------------- |
| Node 22, npm | runs the app (`.nvmrc` pins the version) | `node -v`       |
| Git          | gets the code                            | `git --version` |

```bash
git clone <this repository> trackash && cd trackash
npm ci
```

`npm ci` also installs `better-sqlite3`, which ships prebuilt binaries for macOS, Linux and Windows.
On an unusual platform it compiles itself and needs a C++ toolchain (Xcode Command Line Tools,
`build-essential`, or Visual Studio Build Tools).

## 2. Accounts you need

- **Meu Pluggy** (<https://meu.pluggy.ai>): Pluggy's personal app. Create an account and connect
  your banks, cards and brokers through Open Finance (up to 5 connections, read-only).
- **Pluggy dashboard** (<https://dashboard.pluggy.ai>): a free developer account. Under
  **Applications**, create an application and keep its **Client ID** and **Client Secret** at hand.

## 3. Start the app

```bash
npm run dev        # http://localhost:3000
```

Open <http://localhost:3000>. Until the setup is done, every page leads to it.

## 4. The setup screen

1. **Boas-vindas**: what Trackash does and what you'll need.
2. **Meu Pluggy**: a reminder to connect your banks there first.
3. **Credenciais**: paste the Client ID and Client Secret. They're tested against Pluggy before
   being saved, in the local database.
4. **Conexões**: in dashboard.pluggy.ai open **Applications → your application → Demo**. If you
   haven't yet, connect **MeuPluggy** there (sign in with your Meu Pluggy account and authorize your
   connections). Under **Connected items**, click each item, copy its **ID** (a UUID) and paste it
   into the app, one at a time. Pluggy doesn't list Meu Pluggy items through its API, which is why
   the ids are typed in. Each id is checked against your application.
5. **Extrato da B3** (optional): Pluggy shows the current position of stocks, FIIs, ETFs and BDRs,
   but not your purchase history. The B3 movement statement fills in average cost, result and
   income. In the [Área do Investidor](https://www.investidor.b3.com.br) open **Extratos →
   Movimentação**, pick the longest period available and export it to Excel (.xlsx). Upload it here
   or later on the Investments page. You can upload several periods: nothing is duplicated.
6. **Primeira carga**: press **Concluir e sincronizar**. The app loads up to two years of
   transactions, the card bills and the investments, and shows its progress. When it's done, press
   **Abrir o painel**.

## 5. Day to day

- **Sync**: the app syncs on its own when you open it and the last sync is more than 6 hours old,
  and whenever you press the sync button in the header. Pluggy refreshes its own data every 24
  hours.
- **Portfolio history**: each sync day stores one snapshot of every position, which is what the
  returns, volatility and drawdown are computed from. Sync at least once a day for meaningful
  numbers. To do that without opening the app, schedule `npm run sync`, for example with cron:

  ```
  0 8 * * * cd /path/to/trackash && npm run sync >> data/sync.log 2>&1
  ```

  It's safe to run while the app is open: only one sync runs at a time.

- **New connection**: add its id under **Conexões**, then sync.
- **New B3 statement**: upload it on **Investimentos** or run
  `npm run import-b3 -- data/B3/movimentacao-....xlsx`.
- **New Pluggy credentials**: **Configurações** (the gear in the header).

To check the Pluggy credentials without opening the app: `npm run check-pluggy` (add
`-- <itemId>` to also read one connection).

## 6. Running it all the time

```bash
npm run build
npm start          # production build at http://localhost:4173
```

Or keep using `npm run dev`. Both listen on `localhost` only. Trackash has no sign-in, so it must
not be exposed to other devices or the internet; it refuses requests addressed to any host name
other than `localhost`.

## 7. Your data

- Everything lives in `data/trackash.db` (plus `-wal`/`-shm` files while the app runs): financial
  data, B3 statements and the Pluggy credentials. The file is created readable only by your user,
  and `data/` is git-ignored. **Never commit or share it.**
- **Backup**: copy `data/trackash.db` with the app closed.
- **Somewhere else**: set `TRACKASH_DB_PATH` in a `.env` file (see `.env.example`).
- **Start over**: close the app and delete the database files. The setup comes back on the next
  visit.

## Troubleshooting

| Symptom                                             | Fix                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "A Pluggy recusou as credenciais"                   | copy the Client ID and Secret again from dashboard.pluggy.ai → Applications                    |
| "Conexão não encontrada nesta aplicação da Pluggy"  | the item belongs to another application, or the id is incomplete: copy it again from Demo      |
| A connection shows no data                          | the Meu Pluggy connection must be connected and updated; check its status under Conexões       |
| "Aguarde um minuto entre sincronizações"            | Pluggy is not asked more than once a minute; try again shortly                                 |
| "Sincronização interrompida"                        | the app was closed during a sync; press sync again                                             |
| Stocks without average cost                         | import the B3 movement statement covering their purchases                                      |
| "Trackash only answers on this machine (localhost)" | open it at `http://localhost:3000` (or `:4173` for `npm start`), not through another host name |
| `npm ci` fails building `better-sqlite3`            | install a C++ toolchain (see section 1) and run `npm ci` again                                 |
