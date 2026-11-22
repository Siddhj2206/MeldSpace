import { Button } from "@MeldSpace/ui/components/button";
import { Input } from "@MeldSpace/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { adoptDeviceId, readGuestName } from "@/lib/peer-identity";
import { useTRPC } from "@/utils/trpc";

function randomRoomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Accepts a bare room id or a full share URL and returns the id. */
export function parseRoomRef(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/room\/([^/?#]+)/);
  return match?.[1] ?? trimmed;
}

/**
 * A #4 join code is 6 chars from an unambiguous alphabet (no I/L/O/0/1);
 * room ids are UUIDs. Six chars can only ever be a code — case-insensitive
 * so a typed lowercase code still resolves.
 */
export function isJoinCode(value: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/i.test(value.trim());
}

export default function RoomLauncher() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [name, setName] = useState("");
  const [roomRef, setRoomRef] = useState("");

  const create = useMutation(trpc.room.create.mutationOptions());
  const register = useMutation(trpc.device.register.mutationOptions());
  const join = useMutation(trpc.room.join.mutationOptions());

  const openRoom = (id: string, fresh = false) => {
    void navigate({
      to: "/room/$roomId",
      params: { roomId: id },
      search: fresh ? { fresh: true } : {},
    });
  };

  const onCreate = async () => {
    try {
      // Registered rooms get a join code and control-plane metadata. Signed
      // out or offline, fall back to a local peer-to-peer room.
      const room = await create.mutateAsync({ name: name.trim() || "Untitled room" });
      openRoom(room.id, true);
    } catch {
      openRoom(randomRoomId(), true);
    }
  };

  const onOpen = async () => {
    const ref = roomRef.trim();
    if (!ref) {
      toast.error("Paste a room link, id, or join code");
      return;
    }

    // A 6-char code joins through the control plane (#4): register this device
    // anonymously, record membership, then open the room it resolved to.
    if (isJoinCode(ref)) {
      try {
        const displayName = session?.user.name ?? readGuestName();
        const registered = await register.mutateAsync({ displayName });
        adoptDeviceId(registered.deviceId);
        const joined = await join.mutateAsync({
          joinCode: ref,
          deviceId: registered.deviceId,
          displayName,
        });
        openRoom(joined.roomId);
        return;
      } catch {
        toast.error("Couldn't join with that code — check it, or paste the room link");
        return;
      }
    }

    const id = parseRoomRef(ref);
    if (!id) {
      toast.error("Paste a room link, id, or join code");
      return;
    }
    openRoom(id);
  };

  return (
    <section className="w-full max-w-md rounded-[14px] border border-border-strong bg-surface p-6">
      <div className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
        Start a room
      </div>
      <h2 className="mt-2 text-title-2 font-semibold tracking-tight text-foreground">
        Every peer holds the room
      </h2>
      <p className="mt-1.5 text-body-sm text-muted-foreground">
        Create a room to get a link and, when signed in, a join code. Nothing you write lives on a
        server.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Room name"
          onKeyDown={(event) => {
            if (event.key === "Enter") void onCreate();
          }}
        />
        <Button
          className="h-9.5 w-full text-[14px]"
          disabled={create.isPending}
          onClick={() => void onCreate()}
        >
          {create.isPending ? "Creating…" : "Create room"}
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] tracking-eyebrow text-subtle-foreground">OR</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-2">
        <Input
          value={roomRef}
          onChange={(event) => setRoomRef(event.target.value)}
          placeholder="Paste a room link, id, or 6-letter code"
          onKeyDown={(event) => {
            if (event.key === "Enter") void onOpen();
          }}
        />
        <Button
          variant="outline"
          className="h-9.5 w-full text-[14px]"
          disabled={join.isPending || register.isPending}
          onClick={() => void onOpen()}
        >
          {join.isPending || register.isPending ? "Joining…" : "Open room"}
        </Button>
      </div>
    </section>
  );
}
