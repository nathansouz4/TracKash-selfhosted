import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { appStateQuery } from "@/functions/setup.functions";

// Until the first-run setup is done, every page leads to it.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context: { queryClient } }) => {
    const state = await queryClient.ensureQueryData(appStateQuery);
    if (!state.setupCompleted) throw redirect({ to: "/setup" });
  },
  component: AppShell,
});

function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
