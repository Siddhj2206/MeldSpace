import type { Database } from "@MeldSpace/db";
import { device, member, room } from "@MeldSpace/db/schema/room";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;

function generateJoinCode(length = JOIN_CODE_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[(bytes[i] ?? 0) % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function listRoomMembers(db: Database, roomId: string) {
  return db
    .select({
      id: member.id,
      deviceId: member.deviceId,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
    })
    .from(member)
    .where(eq(member.roomId, roomId))
    .orderBy(asc(member.joinedAt));
}

export const roomRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      for (let attempt = 0; attempt < 5; attempt++) {
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
          if (isUniqueViolation(error) && attempt < 4) continue;
          throw error;
        }
      }
      throw new TRPCError({ code: "CONFLICT", message: "Could not allocate a join code, retry" });
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
        displayName: z.string().trim().min(1).max(100),
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
        .select()
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
          member: {
            id: existing.id,
            deviceId: existing.deviceId,
            displayName: input.displayName,
            joinedAt: existing.joinedAt,
          },
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
          .returning({
            id: member.id,
            deviceId: member.deviceId,
            displayName: member.displayName,
            joinedAt: member.joinedAt,
          });
        if (!created) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to join room" });
        }
        return { roomId: found.id, member: created };
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Lost a race with another join for the same device: read the winner.
          const [winner] = await ctx.db
            .select()
            .from(member)
            .where(and(eq(member.roomId, found.id), eq(member.deviceId, input.deviceId)))
            .limit(1);
          if (winner) {
            return {
              roomId: found.id,
              member: {
                id: winner.id,
                deviceId: winner.deviceId,
                displayName: winner.displayName,
                joinedAt: winner.joinedAt,
              },
            };
          }
        }
        throw error;
      }
    }),
});
