import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { events, participants, notifications } from "@/server/db/schema";

export const eventRouter = createTRPCRouter({
  create: managerProcedure
    .input(
      z.object({
        title: z.string().min(3, "Title must be at least 3 characters."),
        gameName: z.string().min(2, "Game name must be at least 2 characters."),
        description: z.string().optional(),
        prize: z.string().optional(),
        teamSize: z.number().int().default(5),
        maxTeams: z.number().int().min(2, "There must be at least 2 teams."),
        leaderboardCriteria: z
          .enum(["points", "wins", "goal_difference"])
          .default("points"),
        registrationDeadline: z.date().optional(),
        startTime: z.date(),
        endTime: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endTime <= input.startTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be after start time.",
        });
      }

      if (
        input.registrationDeadline &&
        input.registrationDeadline >= input.startTime
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Registration deadline must be before the event start time.",
        });
      }

      const [event] = await ctx.db
        .insert(events)
        .values({
          id: nanoid(),
          ...input,
          managerId: ctx.session.user.id,
          status: "open",
        })
        .returning();

      if (!event) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create event. Please try again.",
        });
      }

      return event;
    }),

  getById: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
        with: {
          manager: {
            columns: { id: true, name: true, email: true },
          },
          teams: {
            with: {
              members: {
                with: {
                  user: {
                    columns: { id: true, name: true, email: true },
                  },
                },
              },
              points: true,
            },
          },
        },
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found.",
        });
      }

      return event;
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.session.user.role;

    if (role === "event_manager") {
      return ctx.db
        .select()
        .from(events)
        .where(eq(events.managerId, ctx.session.user.id))
        .orderBy(desc(events.createdAt));
    }

    const userParticipations = await ctx.db
      .select({
        eventId: participants.eventId,
        isRemovedFromList: participants.isRemovedFromList,
      })
      .from(participants)
      .where(eq(participants.userId, ctx.session.user.id));

    const activeEventIds = userParticipations
      .filter((p) => !p.isRemovedFromList)
      .map((p) => p.eventId);

    if (activeEventIds.length === 0) return [];

    return ctx.db
      .select()
      .from(events)
      .where(inArray(events.id, activeEventIds))
      .orderBy(desc(events.createdAt));
  }),

  update: managerProcedure
    .input(
      z.object({
        eventId: z.string(),
        title: z.string().min(3).optional(),
        gameName: z.string().min(2).optional(),
        description: z.string().optional(),
        prize: z.string().optional(),
        maxTeams: z.number().int().min(2).optional(),
        leaderboardCriteria: z
          .enum(["points", "wins", "goal_difference"])
          .optional(),
        registrationDeadline: z.date().optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        status: z
          .enum([
            "draft",
            "open",
            "registration_closed",
            "ongoing",
            "completed",
            "cancelled",
          ])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { eventId, ...data } = input;

      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, eventId),
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found.",
        });
      }

      if (event.managerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not the manager of this event.",
        });
      }

      if (event.status === "completed" || event.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot update a completed or cancelled event.",
        });
      }

      const [updated] = await ctx.db
        .update(events)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();

      return updated;
    }),

  delete: managerProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found.",
        });
      }

      if (event.managerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not the manager of this event.",
        });
      }

      if (event.status === "ongoing") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete an event that is currently ongoing.",
        });
      }

      await ctx.db.delete(events).where(eq(events.id, input.eventId));

      return { success: true, message: "Event deleted successfully." };
    }),

  declareWinner: managerProcedure
    .input(
      z.object({
        eventId: z.string(),
        winnerTeamId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found.",
        });
      }

      if (event.managerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not the manager of this event.",
        });
      }

      if (event.isWinnerDeclared) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A winner has already been declared for this event.",
        });
      }

      const [updated] = await ctx.db
        .update(events)
        .set({
          winnerId: input.winnerTeamId,
          isWinnerDeclared: true,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId))
        .returning();

      await ctx.db.insert(notifications).values({
        id: nanoid(),
        userId: ctx.session.user.id,
        eventId: input.eventId,
        type: "winner_declared",
        title: "Winner declared!",
        message: `The winner of "${event.title}" has been declared.`,
      });

      return updated;
    }),
});
