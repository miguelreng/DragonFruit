/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Temporal } from "@js-temporal/polyfill";

// Schedule-X v4 checks events.start with `instanceof Temporal.ZonedDateTime`
// against the *global* Temporal. The polyfill lives in its own module scope
// by default, so we have to install it as a global before Schedule-X runs.
if (typeof globalThis !== "undefined" && !(globalThis as { Temporal?: unknown }).Temporal) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Temporal = Temporal;
}

import { ScheduleXCalendar } from "@schedule-x/react";
import {
  createCalendar,
  createViewMonthGrid,
  createViewWeek,
  createViewDay,
} from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import "@schedule-x/theme-default/dist/index.css";

// Schedule-X v4 expects Temporal types. The runtime Temporal API isn't shipped
// in browsers yet (Stage 3 proposal); the polyfill makes it available globally.
// Lib-types prefer the built-in, but the polyfill is API-compatible at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T = Temporal as any;
import { Calendar as CalendarIcon, Check, Trash2 } from "@/components/icons/lucide-shim";
import {
  CalendarService,
  type TCalendarAccount,
  type TCalendarEvent,
  type TCalendarTask,
} from "@/services/calendar.service";

const calendarService = new CalendarService();
const TASKS_CALENDAR_ID = "tasks";
const GOOGLE_CALENDAR_ID = "google";

// Schedule-X v4: events use Temporal types. All-day -> PlainDate; timed -> ZonedDateTime.
// We pull Temporal off the global (the same namespace Schedule-X's instanceof
// checks read from) to guarantee constructor identity.
function toTemporal(iso: string, allDay: boolean) {
  if (!iso) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
  if (!GlobalT) return null;
  const dateOnly = allDay || iso.length === 10;
  if (dateOnly) {
    return GlobalT.PlainDate.from(iso.slice(0, 10));
  }
  const normalized = iso.endsWith("Z") ? iso.slice(0, -1) + "+00:00" : iso;
  return GlobalT.ZonedDateTime.from(`${normalized}[UTC]`);
}

function taskToScheduleXEvent(t: TCalendarTask, workspaceSlug: string) {
  const startSrc = t.start ?? t.end;
  const endSrc = t.end ?? t.start;
  if (!startSrc || !endSrc) return null;
  const allDay = startSrc.length === 10;
  const start = toTemporal(startSrc, allDay);
  const end = toTemporal(endSrc, allDay);
  if (!start || !end) return null;
  return {
    id: `task-${t.id}`,
    title: t.project_identifier && t.sequence_id ? `${t.project_identifier}-${t.sequence_id}  ${t.title}` : t.title,
    start,
    end,
    calendarId: TASKS_CALENDAR_ID,
    description: t.state_name ? `Status: ${t.state_name}` : "",
    _dragonfruit: { kind: "task" as const, projectId: t.project_id, taskId: t.id, workspaceSlug },
  };
}

function googleEventToScheduleXEvent(e: TCalendarEvent) {
  const start = toTemporal(e.start, e.all_day);
  const end = toTemporal(e.end, e.all_day);
  if (!start || !end) return null;
  return {
    id: `gcal-${e.id}`,
    title: e.title,
    start,
    end,
    calendarId: GOOGLE_CALENDAR_ID,
    description: e.description,
    location: e.location,
  };
}

const CALENDARS_CONFIG = {
  [TASKS_CALENDAR_ID]: {
    colorName: "tasks",
    lightColors: { main: "#ec4899", container: "#fce7f3", onContainer: "#831843" },
    darkColors: { main: "#f9a8d4", container: "#831843", onContainer: "#fce7f3" },
  },
  [GOOGLE_CALENDAR_ID]: {
    colorName: "google",
    lightColors: { main: "#2563eb", container: "#dbeafe", onContainer: "#1e3a8a" },
    darkColors: { main: "#93c5fd", container: "#1e3a8a", onContainer: "#dbeafe" },
  },
};

export function CalendarRoot() {
  const { workspaceSlug } = useParams() as { workspaceSlug: string };

  // Tasks: always loaded.
  const taskRange = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
    return { from, to };
  }, []);
  const { data: tasksRes } = useSWR(
    workspaceSlug ? `CALENDAR_TASKS_${workspaceSlug}` : null,
    () => calendarService.tasks(workspaceSlug, taskRange)
  );

  // Google: optional overlay.
  const { data: accounts, mutate: refetchAccounts } = useSWR<TCalendarAccount[]>(
    "CALENDAR_ACCOUNTS",
    () => calendarService.list()
  );
  const googleAccount = accounts?.[0];

  const { data: gEventsRes } = useSWR(
    googleAccount ? `CALENDAR_EVENTS_${googleAccount.id}` : null,
    () => calendarService.events(googleAccount!.id, taskRange)
  );

  const sxEvents = useMemo(() => {
    const taskEvents = (tasksRes?.tasks ?? [])
      .map((t) => taskToScheduleXEvent(t, workspaceSlug))
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const gEvents = (gEventsRes?.events ?? [])
      .map(googleEventToScheduleXEvent)
      .filter((e): e is NonNullable<typeof e> => e !== null);
    return [...taskEvents, ...gEvents];
  }, [tasksRes, gEventsRes, workspaceSlug]);

  const eventsService = useRef(createEventsServicePlugin()).current;
  const calendarAppRef = useRef<ReturnType<typeof createCalendar> | null>(null);
  if (!calendarAppRef.current) {
    calendarAppRef.current = createCalendar({
      views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
      defaultView: createViewMonthGrid().name,
      events: sxEvents,
      calendars: CALENDARS_CONFIG,
      plugins: [eventsService],
    });
  }

  useEffect(() => {
    if (!eventsService) return;
    eventsService.set(sxEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sxEvents]);

  return (
    <div className="flex h-full w-full flex-col">
      <CalendarHeader
        workspaceSlug={workspaceSlug}
        taskCount={tasksRes?.tasks?.length ?? 0}
        googleAccount={googleAccount}
        refetchAccounts={refetchAccounts}
      />
      <div className="dragonfruit-calendar relative h-full w-full flex-1 overflow-hidden">
        {calendarAppRef.current && <ScheduleXCalendar calendarApp={calendarAppRef.current} />}
      </div>
    </div>
  );
}

type CalendarHeaderProps = {
  workspaceSlug: string;
  taskCount: number;
  googleAccount: TCalendarAccount | undefined;
  refetchAccounts: () => void;
};

function CalendarHeader({ taskCount, googleAccount, refetchAccounts, workspaceSlug }: CalendarHeaderProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      if (workspaceSlug) window.localStorage.setItem("last_workspace_slug", workspaceSlug);
    } catch {
      // ignore
    }
    try {
      const { authorize_url } = await calendarService.startGoogle();
      window.location.href = authorize_url;
    } catch (err) {
      console.error("Could not start Google OAuth", err);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!googleAccount) return;
    if (!confirm("Disconnect Google Calendar?")) return;
    await calendarService.disconnect(googleAccount.id);
    refetchAccounts();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
      <div className="flex items-center gap-3 text-sm">
        <LegendDot color="#ec4899" />
        <span>
          Your tasks <span className="ml-1 text-xs text-tertiary">· {taskCount}</span>
        </span>
        {googleAccount && (
          <>
            <span className="text-tertiary">·</span>
            <LegendDot color="#2563eb" />
            <span className="truncate">{googleAccount.account_email || "Google Calendar"}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {googleAccount ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <Trash2 className="size-3.5" />
            Disconnect Google
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-1.5 rounded-md border border-subtle-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-layer-1-hover disabled:opacity-50"
          >
            <CalendarIcon className="size-3.5" />
            {isConnecting ? "Redirecting…" : "Connect Google Calendar"}
          </button>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />;
}

// Suppress unused-import warning — Check is reserved for future state-group toggles.
void Check;
