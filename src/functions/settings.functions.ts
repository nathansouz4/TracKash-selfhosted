import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { appState, configurePluggy, storageInfo } from "@/backend/setup.server";
import { pluggySchema } from "./integration-schemas";

// Configurações: the Pluggy credentials after the setup (tested before saving;
// the screen only learns whether they are set) and where the data lives.

export const getSettings = createServerFn({ method: "GET" }).handler(() => ({
  pluggy: appState().credentials,
  ...storageInfo(),
}));

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => getSettings(),
});

export const updatePluggySettings = createServerFn({ method: "POST" })
  .validator(pluggySchema)
  .handler(async ({ data }) => {
    await configurePluggy(data);
    return { ok: true };
  });
