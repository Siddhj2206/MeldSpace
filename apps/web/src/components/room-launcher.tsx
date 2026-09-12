import { Button } from "@MeldSpace/ui/components/button";
import { Input } from "@MeldSpace/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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

export default function RoomLauncher() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [roomRef, setRoomRef] = useState("");

  const create = useMutation(trpc.room.create.mutationOptions());

  const openRoom = (id: string) => {
    void navigate({ to: "/room/$roomId", params: { roomId: id } });
  };

  const onCreate = async () => {
    try {
      // Registered rooms get a join code and control-plane metadata. Signed
      // out or offline, fall back to a local peer-to-peer room.
      const room = await create.mutateAsync({ name: name.trim() || "Untitled room" });
      openRoom(room.id);
    } catch {
      openRoom(randomRoomId());
    }
  };

  const onOpen = () => {
    const id = parseRoomRef(roomRef);
    if (!id) {
      toast.error("Paste a room link or id");
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
          placeholder="Paste a room link or id"
          onKeyDown={(event) => {
            if (event.key === "Enter") onOpen();
          }}
        />
        <Button variant="outline" className="h-9.5 w-full text-[14px]" onClick={onOpen}>
          Open room
        </Button>
      </div>
    </section>
  );
}
