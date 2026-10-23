import { queryOptions } from "@tanstack/react-query";
import { getConnections } from "./connections.functions";
import { getCards, getFlow, getInvestments, getOverview } from "./dashboard.functions";
import { getSyncStatus } from "./sync.functions";

// TanStack Query options over the server functions. After a sync or a
// connection change, invalidate ["finance"] to refresh every dashboard.

export const overviewQuery = queryOptions({
  queryKey: ["finance", "overview"],
  queryFn: () => getOverview(),
});

export const investmentsQuery = queryOptions({
  queryKey: ["finance", "investments"],
  queryFn: () => getInvestments(),
});

export const flowQuery = (month: string) =>
  queryOptions({
    queryKey: ["finance", "flow", month],
    queryFn: () => getFlow({ data: { month } }),
  });

export const cardsQuery = (month: string, cardId: string | null) =>
  queryOptions({
    queryKey: ["finance", "cards", month, cardId],
    queryFn: () => getCards({ data: { month, cardId } }),
  });

export const connectionsQuery = queryOptions({
  queryKey: ["finance", "connections"],
  queryFn: () => getConnections(),
});

/** Polled every second while a sync runs. */
export const syncStatusQuery = queryOptions({
  queryKey: ["sync", "status"],
  queryFn: () => getSyncStatus(),
  staleTime: 0,
  refetchInterval: (query) => (query.state.data?.running ? 1000 : false),
});
