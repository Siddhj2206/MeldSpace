import { device } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { nameInput } from "../lib/inputs";

export const deviceRouter = router({
  register: publicProcedure
    .input(
      z.object({
        displayName: nameInput,
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
});
