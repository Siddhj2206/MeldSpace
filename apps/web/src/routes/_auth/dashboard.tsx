import { Button } from "@MeldSpace/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { initials } from "@/room/identity";

export const Route = createFileRoute("/_auth/dashboard")({
  component: AccountPage,
});

function AccountPage() {
  const { session } = Route.useRouteContext();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
        <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
          Account
        </span>
        <div className="flex items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-id-5 text-body-sm font-semibold text-[#0B0C0D]">
            {initials(session.user.name)}
          </span>
          <div className="flex flex-col">
            <span className="text-title-3 font-semibold tracking-tight text-foreground">
              {session.user.name}
            </span>
            <span className="text-body-sm text-muted-foreground">{session.user.email}</span>
          </div>
        </div>
        <div className="h-px w-full bg-border" />
        <p className="text-body-sm text-muted-foreground">
          Your rooms are held on the peers that open them, not on this account. Signing in only
          links your device so a room can list you by name.
        </p>
        <div>
          <Link to="/">
            <Button className="h-9.5 px-4 text-[14px]">Open a room</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
