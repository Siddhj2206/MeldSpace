import { Link } from "@tanstack/react-router";

import { MeldMark } from "@/room/icons";

import UserMenu from "./user-menu";

/** Quiet top bar for the non-room surfaces (home, account, auth). */
export default function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
      <Link to="/" className="flex items-center gap-2.5 outline-none">
        <span className="flex size-6.5 items-center justify-center rounded-sm border border-border-strong bg-surface-2">
          <MeldMark />
        </span>
        <span className="font-mono text-eyebrow tracking-[0.16em] text-foreground">MELDSPACE</span>
      </Link>
      <UserMenu />
    </header>
  );
}
