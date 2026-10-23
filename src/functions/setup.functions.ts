import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { appState, completeSetup, configurePluggy, SetupError } from "@/backend/setup.server";
import { startSync, SyncError } from "@/backend/sync.server";
import { pluggySchema } from "./integration-schemas";

// First-run setup and the app shell's state. Item ids are added through
// connections.functions.ts, the same endpoint the Connections screen uses.

export const getAppState = createServerFn({ method: "GET" }).handler(() => appState());

export const appStateQuery = queryOptions({
  queryKey: ["app", "state"],
  queryFn: () => getAppState(),
  staleTime: 0,
});

export const savePluggyCredentials = createServerFn({ method: "POST" })
  .validator(pluggySchema)
  .handler(async ({ data }) => {
    await configurePluggy(data);
    return { ok: true };
  });

/** Last step: marks the setup as done and starts the first sync. */
export const finishSetup = createServerFn({ method: "POST" }).handler(() => {
  try {
    completeSetup();
    return startSync();
  } catch (error) {
    if (error instanceof SetupError || error instanceof SyncError) throw new Error(error.message);
    console.error(error);
    throw new Error("Não foi possível concluir a configuração.");
  }
});
