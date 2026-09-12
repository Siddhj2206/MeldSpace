import { protectedProcedure, publicProcedure, router } from "../index";
import { deviceRouter } from "./device";
import { memberRouter } from "./member";
import { roomRouter } from "./room";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  room: roomRouter,
  device: deviceRouter,
  member: memberRouter,
});
export type AppRouter = typeof appRouter;
