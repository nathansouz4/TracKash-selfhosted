import { databasePath } from "./db.server";
import { forgetApiKey, PluggyError, verifyPluggyCredentials } from "./pluggy.server";
import { countItems } from "./queries.server";
import { pluggyCredentials, readSetting, SETTING, writeSettings } from "./settings.server";
import { lastSuccessfulSync } from "./sync.server";

// Instance state for the first-run setup and the app shell. Nothing here needs a
// sign-in: the app only answers on this machine (see src/start.ts).

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

export type AppState = {
  /** Pluggy client id + secret saved. */
  credentials: boolean;
  connections: number;
  /** The owner finished the setup screen. */
  setupCompleted: boolean;
  lastSuccessfulSync: string | null;
};

export function appState(): AppState {
  return {
    credentials: pluggyCredentials() !== null,
    connections: countItems(),
    setupCompleted: readSetting(SETTING.setupCompletedAt) !== null,
    lastSuccessfulSync: lastSuccessfulSync(),
  };
}

/** Tests the credentials against Pluggy before saving them. */
export async function configurePluggy(input: { clientId: string; clientSecret: string }) {
  try {
    await verifyPluggyCredentials(input.clientId, input.clientSecret);
  } catch (error) {
    if (error instanceof PluggyError) throw new SetupError(error.message);
    throw error;
  }
  writeSettings({
    [SETTING.pluggyClientId]: input.clientId,
    [SETTING.pluggyClientSecret]: input.clientSecret,
  });
  // A cached API key belongs to the previous credentials.
  forgetApiKey();
}

export function completeSetup(): void {
  const state = appState();
  if (!state.credentials) throw new SetupError("Informe as credenciais da Pluggy.");
  if (state.connections === 0) throw new SetupError("Adicione pelo menos uma conexão.");
  if (!state.setupCompleted) {
    writeSettings({ [SETTING.setupCompletedAt]: new Date().toISOString() });
  }
}

/** Where the data lives, for the settings screen (backups, starting over). */
export function storageInfo() {
  return { databasePath: databasePath() };
}
