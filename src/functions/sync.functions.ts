import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { startSync as start, SyncError, syncStatus } from "@/backend/sync.server";

/** How old the last sync may be before opening the app starts a new one. */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60_000;

/** Starts a sync in the background; the screens follow it through getSyncStatus. */
export const startSync = createServerFn({ method: "POST" })
  .validator(z.object({ auto: z.boolean() }))
  .handler(({ data }) => {
    try {
      return start(data.auto ? { ifOlderThanMs: AUTO_SYNC_AFTER_MS } : {});
    } catch (error) {
      if (error instanceof SyncError) throw new Error(error.message);
      console.error(error);
      throw new Error("Não foi possível iniciar a sincronização.");
    }
  });

export const getSyncStatus = createServerFn({ method: "GET" }).handler(() => {
  setResponseHeaders(new Headers({ "Cache-Control": "no-store, private" }));
  return syncStatus();
});
