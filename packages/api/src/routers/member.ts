import { member, room } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const memberRouter = router({
  list: publicProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select({ id: room.id })
        .from(room)
        .where(eq(room.id, input.roomId))
        .limit(1);
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      }
      return ctx.db
        .select({
          id: member.id,
          deviceId: member.deviceId,
          displayName: member.displayName,
          joinedAt: member.joinedAt,
        })
        .from(member)
        .where(eq(member.roomId, input.roomId))
        .orderBy(asc(member.joinedAt));
    }),
});
