import { createFileRoute } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { RoomProvider } from "@/room/room-provider";
import { RoomShell } from "@/room/room-shell";

export const Route = createFileRoute("/room/$roomId")({
  ssr: false,
  component: RoomRoute,
});

function RoomRoute() {
  const { roomId } = Route.useParams();
  // Session is best-effort chrome: the room works signed out and offline.
  const { data: session } = authClient.useSession();

  return (
    <RoomProvider roomId={roomId} displayName={session?.user.name}>
      <RoomShell />
    </RoomProvider>
  );
}
