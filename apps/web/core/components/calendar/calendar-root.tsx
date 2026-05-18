/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ScheduleXCalendar } from "@schedule-x/react";
import {
  createCalendar,
  createViewMonthGrid,
  createViewWeek,
  createViewDay,
} from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import "@schedule-x/theme-default/dist/index.css";
import { Calendar as CalendarIcon, Trash2 } from "@/components/icons/lucide-shim";
import { CalendarService, type TCalendarAccount, type TCalendarEvent } from "@/services/calendar.service";

const calendarService = new CalendarService();

// Schedule-X expects "YYYY-MM-DD HH:mm" for timed events and "YYYY-MM-DD" for all-day.
function toScheduleXTime(iso: string, allDay: boolean): string {
  if (!iso) return "";
  if (allDay) return iso.slice(0, 10);
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toScheduleXEvent(e: TCalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    start: toScheduleXTime(e.start, e.all_day),
    end: toScheduleXTime(e.end, e.all_day),
  };
}

export function CalendarRoot() {
  const { data: accounts, isLoading, mutate: refetchAccounts } = useSWR<TCalendarAccount[]>(
    "CALENDAR_ACCOUNTS",
    () => calendarService.list()
  );
  const account = accounts?.[0];

  if (isLoading) return <CalendarSkeleton />;
  if (!account) return <ConnectGoogleEmptyState refetchAccounts={refetchAccounts} />;
  return <ConnectedCalendar account={account} refetchAccounts={refetchAccounts} />;
}

function ConnectGoogleEmptyState({ refetchAccounts }: { refetchAccounts: () => void }) {
  const { workspaceSlug } = useParams() as { workspaceSlug?: string };
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    // Remember which workspace to return to after Google bounces us through
    // the top-level callback route.
    if (workspaceSlug) {
      try {
        window.localStorage.setItem("last_workspace_slug", workspaceSlug);
      } catch {
        // ignore storage failures; the callback will fall back to /
      }
    }
    try {
      const { authorize_url } = await calendarService.startGoogle();
      window.location.href = authorize_url;
    } catch (err) {
      console.error("Could not start Google OAuth", err);
      setIsConnecting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <CalendarIcon className="size-10 text-tertiary" />
      <div>
        <div className="text-base font-medium">Connect your calendar</div>
        <div className="mt-1 text-sm text-tertiary">
          See your Google Calendar events alongside DragonFruit. Read-only — we never modify your calendar.
        </div>
      </div>
      <button
        type="button"
        onClick={handleConnect}
        disabled={isConnecting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {isConnecting ? "Redirecting to Google…" : "Connect Google Calendar"}
      </button>
    </div>
  );
}

function ConnectedCalendar({
  account,
  refetchAccounts,
}: {
  account: TCalendarAccount;
  refetchAccounts: () => void;
}) {
  const eventsService = useRef(createEventsServicePlugin()).current;

  // Range covers roughly the visible month grid plus a buffer.
  const [range] = useState(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
    return { from, to };
  });

  const { data: eventsRes, isLoading } = useSWR(
    account ? `CALENDAR_EVENTS_${account.id}` : null,
    () => calendarService.events(account.id, range)
  );

  const sxEvents = useMemo(
    () => (eventsRes?.events ?? []).map(toScheduleXEvent),
    [eventsRes]
  );

  // Build the calendar once. Schedule-X expects a stable instance across
  // renders; later event updates flow through the eventsService plugin.
  const calendarAppRef = useRef<ReturnType<typeof createCalendar> | null>(null);
  if (!calendarAppRef.current) {
    calendarAppRef.current = createCalendar({
      views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
      defaultView: createViewMonthGrid().name,
      events: sxEvents,
      plugins: [eventsService],
    });
  }

  // When the events list refetches, sync the service.
  useEffect(() => {
    if (!eventsService) return;
    eventsService.set(sxEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sxEvents]);

  const handleDisconnect = async () => {
    if (!confirm("Disconnect this calendar? Events will stop showing.")) return;
    await calendarService.disconnect(account.id);
    refetchAccounts();
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-subtle-1 px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarIcon className="size-4 text-tertiary" />
          <span className="font-medium">{account.account_email || "Google Calendar"}</span>
          {isLoading && <span className="text-xs text-tertiary">syncing…</span>}
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tertiary hover:bg-layer-1-hover hover:text-primary"
        >
          <Trash2 className="size-3.5" />
          Disconnect
        </button>
      </div>
      <div className="dragonfruit-calendar h-full w-full flex-1 overflow-hidden">
        {calendarAppRef.current && <ScheduleXCalendar calendarApp={calendarAppRef.current} />}
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-tertiary">Loading calendar…</div>
  );
}
