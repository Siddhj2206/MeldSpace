import { device, member, room } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";
import { nameInput } from "../lib/inputs";
import { listRoomMembers, memberColumns } from "../lib/member";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;
const MAX_JOIN_CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = "23505";

function generateJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[(bytes[i] ?? 0) % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

// drizzle-orm wraps driver errors (e.g. DrizzleQueryError), so the Postgres
// error code lives on `.cause` rather than on the thrown error itself. Walk
// the cause chain to find it.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
    return true;
  }
  const { cause } = error as { cause?: unknown };
  return cause !== undefined && cause !== error && isUniqueViolation(cause);
}

export const roomRouter = router({
  create: protectedProcedure
    .input(z.object({ name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
        try {
          const [created] = await ctx.db
            .insert(room)
            .values({
              name: input.name,
              joinCode: generateJoinCode(),
              createdBy: ctx.session.user.id,
            })
            .returning({ id: room.id, name: room.name, joinCode: room.joinCode });
          if (!created) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create room",
            });
          }
          return created;
        } catch (error) {
          // A join-code collision is the only retryable failure here.
          if (isUniqueViolation(error)) continue;
          throw error;
        }
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: "Could not allocate a join code, retry",
      });
    }),

  byId: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const [found] = await ctx.db.select().from(room).where(eq(room.id, input.id)).limit(1);
    if (!found) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
    }
    const members = await listRoomMembers(ctx.db, found.id);
    return {
      id: found.id,
      name: found.name,
      joinCode: found.joinCode,
      members,
    };
  }),

  join: publicProcedure
    .input(
      z.object({
        joinCode: z.string().trim().min(1).max(32),
        deviceId: z.string().min(1),
        displayName: nameInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const code = input.joinCode.trim().toUpperCase();
      const [found] = await ctx.db.select().from(room).where(eq(room.joinCode, code)).limit(1);
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found for join code" });
      }
      const [knownDevice] = await ctx.db
        .select({ id: device.id })
        .from(device)
        .where(eq(device.id, input.deviceId))
        .limit(1);
      if (!knownDevice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not registered. Call device.register first.",
        });
      }

      await ctx.db
        .update(device)
        .set({ displayName: input.displayName, lastSeenAt: new Date() })
        .where(eq(device.id, input.deviceId));

      const [existing] = await ctx.db
        .select(memberColumns)
        .from(member)
        .where(and(eq(member.roomId, found.id), eq(member.deviceId, input.deviceId)))
        .limit(1);
      if (existing) {
        if (existing.displayName !== input.displayName) {
          await ctx.db
            .update(member)
            .set({ displayName: input.displayName })
            .where(eq(member.id, existing.id));
        }
        return {
          roomId: found.id,
          member: { ...existing, displayName: input.displayName },
        };
      }

      try {
        const [created] = await ctx.db
          .insert(member)
          .values({
            roomId: found.id,
            deviceId: input.deviceId,
            displayName: input.displayName,
          })
          .returning(memberColumns);
        if (!created) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to join room" });
        }
        return { roomId: found.id, member: created };
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Lost a race with another join for the same device: read the winner.
          const [winner] = await ctx.db
            .select(memberColumns)
            .from(member)
            .where(and(eq(member.roomId, found.id), eq(member.deviceId, input.deviceId)))
            .limit(1);
          if (winner) {
            return { roomId: found.id, member: winner };
          }
        }
        throw error;
      }
    }),
});
