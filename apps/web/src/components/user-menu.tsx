import { Button } from "@MeldSpace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@MeldSpace/ui/components/dropdown-menu";
import { Skeleton } from "@MeldSpace/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { initials } from "@/room/identity";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-8 w-20" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline" size="sm" className="text-[13px]">
          Sign in
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-2 pr-2.5 text-[13px]" />}
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-id-5 text-[9px] font-semibold text-[#0B0C0D]">
          {initials(session.user.name)}
        </span>
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border border-border-strong bg-surface-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-eyebrow tracking-eyebrow text-subtle-foreground uppercase">
            Account
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-subtle-foreground">
            {session.user.email}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    void navigate({ to: "/" });
                  },
                },
              });
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
