import type { Database } from "@MeldSpace/db";
import { member } from "@MeldSpace/db/schema/room";
import { asc, eq } from "drizzle-orm";

/**
 * Frozen member projection — the control-plane contract the client lane
 * builds against (#15). `memberColumns` and `Member` must stay in lockstep;
 * every router that returns a member selects through `memberColumns`.
 */
export const memberColumns = {
  id: member.id,
  deviceId: member.deviceId,
  displayName: member.displayName,
  joinedAt: member.joinedAt,
} as const;

export type Member = {
  id: string;
  deviceId: string;
  displayName: string;
  joinedAt: Date;
};

export function listRoomMembers(db: Database, roomId: string): Promise<Member[]> {
  return db
    .select(memberColumns)
    .from(member)
    .where(eq(member.roomId, roomId))
    .orderBy(asc(member.joinedAt));
}
