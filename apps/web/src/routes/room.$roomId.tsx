import { createFileRoute } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { RoomProvider } from "@/room/room-provider";
import { RoomShell } from "@/room/room-shell";

export const Route = createFileRoute("/room/$roomId")({
  ssr: false,
  component: RoomRoute,
  // `?fresh` marks a room the create flow just made: the creator seeds the
  // sample paper once local persistence loads (see RoomProvider).
  validateSearch: (search: Record<string, unknown>): { fresh?: boolean } => ({
    fresh: search.fresh === true || search.fresh === "true" ? true : undefined,
  }),
});

function RoomRoute() {
  const { roomId } = Route.useParams();
  const { fresh } = Route.useSearch();
  // Session is best-effort chrome: the room works signed out and offline.
  const { data: session } = authClient.useSession();

  return (
    <RoomProvider roomId={roomId} displayName={session?.user.name} seedProject={fresh}>
      <RoomShell />
    </RoomProvider>
  );
}
