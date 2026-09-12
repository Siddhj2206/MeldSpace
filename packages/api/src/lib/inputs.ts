import { z } from "zod";

/** Human-readable names: room names and device/member display names. */
export const nameInput = z.string().trim().min(1).max(100);
