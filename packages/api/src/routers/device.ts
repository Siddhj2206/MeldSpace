import { device } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

const displayNameInput = z.string().trim().min(1).max(100);

export const deviceRouter = router({
  register: publicProcedure
    .input(
      z.object({
        displayName: displayNameInput,
        publicKey: z.string().trim().max(2048).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(device)
        .values({
          displayName: input.displayName,
          publicKey: input.publicKey ?? null,
          userId: ctx.session?.user.id ?? null,
          lastSeenAt: new Date(),
        })
        .returning({ id: device.id, displayName: device.displayName });
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to register device",
        });
      }
      return { deviceId: created.id, displayName: created.displayName };
    }),

  touch: publicProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(device)
        .set({ lastSeenAt: new Date() })
        .where(eq(device.id, input.deviceId))
        .returning({ id: device.id });
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not registered. Call device.register first.",
        });
      }
      return { deviceId: updated.id };
    }),
});
