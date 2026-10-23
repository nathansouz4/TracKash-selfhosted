import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { pluggy, PluggyError } from "@/backend/pluggy.server";
import {
  connectionsData,
  countItems,
  removeItem,
  setAccountIgnored,
  setItemInstitution,
} from "@/backend/queries.server";
import { applyDuplicateRules, resolveInstitution, upsertItem } from "@/backend/sync.server";
import { normalizeItemId } from "@/lib/setup";

const MAX_CONNECTIONS = 10; // Meu Pluggy allows 5 banks; leave headroom, block abuse.

export const getConnections = createServerFn({ method: "GET" }).handler(() => {
  setResponseHeaders(new Headers({ "Cache-Control": "no-store, private" }));
  return connectionsData();
});

export const addConnection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      itemId: z
        .string()
        .transform(normalizeItemId)
        .pipe(z.string().uuid("Informe um itemId válido (UUID).")),
    }),
  )
  .handler(async ({ data }) => {
    if (countItems() >= MAX_CONNECTIONS) {
      throw new Error("Limite de conexões atingido.");
    }
    try {
      // Only items that belong to this Pluggy application resolve here.
      const item = await pluggy.getItem(data.itemId);
      const accounts = await pluggy.listAccounts(data.itemId);
      const institution = await resolveInstitution(accounts.filter((a) => a.itemId === item.id));
      upsertItem(item, institution);
      applyDuplicateRules();
      return { name: institution?.name ?? item.connector?.name ?? "Conexão" };
    } catch (error) {
      if (error instanceof PluggyError && (error.status === 404 || error.status === 400)) {
        throw new Error("Conexão não encontrada nesta aplicação da Pluggy. Confira o itemId.");
      }
      if (error instanceof PluggyError) throw new Error(error.message);
      throw new Error("Não foi possível adicionar a conexão.");
    }
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .validator(z.object({ itemId: z.string().uuid() }))
  .handler(({ data }) => {
    // The cascades remove its accounts, transactions and history.
    const removed = removeItem(data.itemId);
    if (!removed) throw new Error("Conexão não encontrada.");
    return { ok: true };
  });

/** Personal-bank connectors of Pluggy's catalog, to pick a connection's institution. */
export const getInstitutionOptions = createServerFn({ method: "GET" }).handler(async () => {
  const catalog = await pluggy.listConnectors();
  const seen = new Set<string>();
  return catalog
    .filter((c) => !c.isSandbox && c.type !== "BUSINESS_BANK" && !/empresas/i.test(c.name))
    .sort(
      (a, b) => Number(b.isOpenFinance) - Number(a.isOpenFinance) || a.name.localeCompare(b.name),
    )
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});

export const setConnectionInstitution = createServerFn({ method: "POST" })
  .validator(
    z.object({ itemId: z.string().uuid(), connectorId: z.number().int().positive().nullable() }),
  )
  .handler(async ({ data }) => {
    if (data.connectorId == null) {
      // Back to automatic detection (applied on the next sync).
      if (!setItemInstitution(data.itemId, null)) throw new Error("Conexão não encontrada.");
      return { name: null };
    }
    const connector = (await pluggy.listConnectors()).find((c) => c.id === data.connectorId);
    if (!connector) throw new Error("Instituição não encontrada no catálogo da Pluggy.");
    const ok = setItemInstitution(data.itemId, {
      name: connector.name,
      imageUrl: connector.imageUrl,
      color: connector.primaryColor,
    });
    if (!ok) throw new Error("Conexão não encontrada.");
    return { name: connector.name };
  });

export const setAccountIgnore = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accountId: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[\w-]+$/),
      ignored: z.boolean(),
    }),
  )
  .handler(({ data }) => {
    if (!setAccountIgnored(data.accountId, data.ignored)) {
      throw new Error("Conta não encontrada.");
    }
    return { ok: true };
  });
