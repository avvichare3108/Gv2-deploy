"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  Users,
  Trophy,
  Pencil,
  Trash2,
  Medal,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/shared/page-header";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { RoleGate } from "@/components/shared/role-gate";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface EventDetailProps {
  eventId: string;
}

/* ✅ FIXED: MetaItem added properly */
function MetaItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-white/20" />
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/20">
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-white/60">
          {children}
        </span>
      </div>
    </div>
  );
}

export function EventDetail({ eventId }: EventDetailProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: event, isLoading } = api.event.getById.useQuery({ eventId });

  const { mutate: deleteEvent, isPending: isDeleting } =
    api.event.delete.useMutation({
      onSuccess: () => {
        toast.success("Event deleted.");
        void utils.event.getAll.invalidate();
        router.push("/events");
      },
      onError: (err) => toast.error(err.message),
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 bg-white/[0.03]" />
        <Skeleton className="h-[200px] bg-white/[0.03]" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/20">
          Event not found
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={event.title}
        subtitle={event.gameName}
        action={
          <RoleGate allow="event_manager">
            <div className="flex items-center gap-2">
              <Link href={`/events/${eventId}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/[0.08] font-mono text-[10px] uppercase tracking-widest text-white/40 hover:text-white/70"
                >
                  <Pencil className="mr-1.5 h-3 w-3" />
                  Edit
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="border-red-500/20 font-mono text-[10px] uppercase tracking-widest text-red-400/60 hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Delete
              </Button>
            </div>
          </RoleGate>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded border border-white/[0.06] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                Event Details
              </h2>
              <EventStatusBadge status={event.status} />
            </div>

            {event.description && (
              <p className="mb-5 font-mono text-[12px] leading-relaxed text-white/50">
                {event.description}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <MetaItem icon={Calendar} label="Start">
                {format(new Date(event.startTime), "MMM dd, yyyy · HH:mm")}
              </MetaItem>

              <MetaItem icon={Calendar} label="End">
                {format(new Date(event.endTime), "MMM dd, yyyy · HH:mm")}
              </MetaItem>

              <MetaItem icon={Users} label="Teams">
                {event.maxTeams} teams · {event.teamSize}v{event.teamSize}
              </MetaItem>

              <MetaItem icon={Trophy} label="Ranking">
                {event.leaderboardCriteria.replace("_", " ")}
              </MetaItem>

              {event.prize && (
                <MetaItem icon={Medal} label="Prize">
                  {event.prize}
                </MetaItem>
              )}

              {event.registrationDeadline && (
                <MetaItem icon={Clock} label="Reg. Deadline">
                  {format(
                    new Date(event.registrationDeadline),
                    "MMM dd, yyyy"
                  )}
                </MetaItem>
              )}
            </div>
          </div>

          {event.isWinnerDeclared && event.winnerId && (
            <WinnerBanner eventId={eventId} />
          )}
        </div>

        <RoleGate allow="event_manager">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/20">
              Manage
            </p>

            {[
              { label: "Teams", href: `/events/${eventId}/teams` },
              { label: "Matches & Points", href: `/events/${eventId}/matches` },
              { label: "Leaderboard", href: `/events/${eventId}/leaderboard` },
            ].map((link) => (
              <Link key={link.href} href={link.href}>
                <div className="flex items-center justify-between rounded border border-white/[0.06] bg-[#111] px-4 py-3 transition-colors hover:border-white/[0.12] hover:bg-[#151515]">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-white/50">
                    {link.label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                </div>
              </Link>
            ))}
          </div>
        </RoleGate>

        <RoleGate allow="participant">
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/20">
              View
            </p>
            <Link href={`/events/${eventId}/leaderboard`}>
              <div className="flex items-center justify-between rounded border border-white/[0.06] bg-[#111] px-4 py-3 transition-colors hover:border-white/[0.12]">
                <span className="font-mono text-[11px] uppercase tracking-wider text-white/50">
                  Leaderboard
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-white/20" />
              </div>
            </Link>
          </div>
        </RoleGate>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Event"
        description={`Are you sure you want to delete "${event.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={() => deleteEvent({ eventId })}
        variant="destructive"
      />
    </div>
  );
}

/* Winner Banner */
function WinnerBanner({ eventId }: { eventId: string }) {
  const { data } = api.leaderboard.getByEvent.useQuery({ eventId });
  const winner = data?.rankings.find((r) => r.rank === 1);

  if (!winner) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded border border-amber-400/20 bg-amber-400/5 p-5"
    >
      <div className="flex items-center gap-3">
        <Trophy className="h-5 w-5 text-amber-400" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400/60">
            Winner
          </p>
          <p className="font-mono text-[14px] uppercase tracking-wider text-amber-400">
            {winner.teamName}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
