import { all, NOW_SQL, run, transaction } from "./db.server";

// Instance settings, kept in the local database next to the data they unlock.
// Screens only ever learn whether a credential is set, never its value.

export const SETTING = {
  pluggyClientId: "pluggy_client_id",
  pluggyClientSecret: "pluggy_client_secret",
  /** When the owner finished the first-run setup (ISO timestamp). */
  setupCompletedAt: "setup_completed_at",
} as const;

type SettingKey = (typeof SETTING)[keyof typeof SETTING];

export function readSettings(): Partial<Record<SettingKey, string>> {
  const rows = all<{ key: SettingKey; value: string }>("select key, value from settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function readSetting(key: SettingKey): string | null {
  return readSettings()[key] ?? null;
}

/** Writes the given settings at once; `null` removes one. */
export function writeSettings(values: Partial<Record<SettingKey, string | null>>): void {
  transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) run("delete from settings where key = ?", key);
      else
        run(
          `insert into settings (key, value) values (?, ?)
           on conflict (key) do update set value = excluded.value, updated_at = ${NOW_SQL}`,
          key,
          value,
        );
    }
  });
}

export function pluggyCredentials(): { clientId: string; clientSecret: string } | null {
  const settings = readSettings();
  const clientId = settings[SETTING.pluggyClientId];
  const clientSecret = settings[SETTING.pluggyClientSecret];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
