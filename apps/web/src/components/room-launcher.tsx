import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@MeldSpace/ui/components/button";
import { Input } from "@MeldSpace/ui/components/input";

export default function RoomLauncher() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const createRoom = () => {
    const id = crypto.randomUUID().slice(0, 8);
    void navigate({ to: "/room/$roomId", params: { roomId: id } });
  };

  const joinRoom = () => {
    const id = code.trim();
    if (!id) return;
    void navigate({ to: "/room/$roomId", params: { roomId: id } });
  };

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 font-medium">Room</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={createRoom}>Create room</Button>
        <span className="text-muted-foreground text-sm">or</span>
        <Input
          className="max-w-48"
          placeholder="room code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") joinRoom();
          }}
        />
        <Button variant="outline" onClick={joinRoom}>
          Join
        </Button>
      </div>
    </section>
  );
}
