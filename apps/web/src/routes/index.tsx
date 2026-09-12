import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import RoomLauncher from "@/components/room-launcher";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-16">
        <div className="flex max-w-2xl flex-col items-center text-center">
          <span className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
            A peer-to-peer room
          </span>
          <h1 className="mt-4 text-[32px] leading-[1.12] font-semibold tracking-tight text-foreground">
            The room itself is the shared object.
          </h1>
          <p className="mt-4 max-w-lg text-body text-muted-foreground">
            Peers hold replicas, exchange changes directly, and keep working while disconnected.
            There is no owner and no central copy of what you make.
          </p>
        </div>
        <RoomLauncher />
      </main>
      <footer className="flex items-center justify-center pb-8">
        <span className="font-mono text-[10px] tracking-eyebrow text-subtle-foreground uppercase">
          Converged, not synced
        </span>
      </footer>
    </div>
  );
}
