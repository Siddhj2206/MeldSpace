import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  ssr: false,
  component: AuthLayout,
  beforeLoad: async ({ context }) => {
    // Session comes from the control plane through the tRPC client. There is no
    // server function in the SPA build. Force a fresh read (not the cached
    // value) so a just-signed-in user isn't bounced by a stale `null`. Offline
    // the request fails; treat that as signed out instead of letting it block
    // navigation.
    let session = null;
    try {
      session = await context.queryClient.fetchQuery({
        ...context.trpc.session.queryOptions(),
        staleTime: 0,
      });
    } catch {
      session = null;
    }
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
});

function AuthLayout() {
  return <Outlet />;
}
