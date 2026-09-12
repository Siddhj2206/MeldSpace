import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Control plane is metadata only:
// - No room content (no document/canvas/CRDT/blob columns).
// - No authority columns (no owner/coordinator/epoch). Coordinator is
//   presence-derived (see #10); membership is equal-authority.

export const room = pgTable(
  "room",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    joinCode: text("join_code").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("room_join_code_uidx").on(table.joinCode)],
);

export const device = pgTable(
  "device",
  {
    // Stable peer identity. Membership keys off this, NOT doc.clientID
    // (which is random per Yjs session).
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    publicKey: text("public_key"),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("device_user_id_idx").on(table.userId)],
);

export const member = pgTable(
  "member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    // Snapshot of the device display name at join time.
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("member_room_device_uidx").on(table.roomId, table.deviceId),
    index("member_room_id_idx").on(table.roomId),
    index("member_device_id_idx").on(table.deviceId),
  ],
);

export const invite = pgTable(
  "invite",
  {
    code: text("code").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at"),
    maxUses: integer("max_uses"),
    uses: integer("uses").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invite_room_id_idx").on(table.roomId)],
);

export const roomRelations = relations(room, ({ many }) => ({
  members: many(member),
  invites: many(invite),
}));

export const deviceRelations = relations(device, ({ many, one }) => ({
  memberships: many(member),
  user: one(user, {
    fields: [device.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  room: one(room, {
    fields: [member.roomId],
    references: [room.id],
  }),
  device: one(device, {
    fields: [member.deviceId],
    references: [device.id],
  }),
}));

export const inviteRelations = relations(invite, ({ one }) => ({
  room: one(room, {
    fields: [invite.roomId],
    references: [room.id],
  }),
}));
