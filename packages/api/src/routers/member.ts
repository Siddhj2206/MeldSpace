import { room } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { listRoomMembers } from "../lib/member";

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
      return await listRoomMembers(ctx.db, input.roomId);
    }),
});
