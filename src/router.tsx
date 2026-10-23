import { QueryClient } from "@tanstack/react-query";
import { getGlobalStartContext } from "@tanstack/react-start";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data only changes when a sync runs, and a sync invalidates ["finance"].
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  // Server: the per-request CSP nonce set by the security middleware in start.ts.
  const nonce = getGlobalStartContext()?.nonce;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a tab's data when the pointer rests on its link.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
