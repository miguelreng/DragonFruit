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
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import "@schedule-x/theme-default/dist/index.css";

// Schedule-X v4 expects Temporal types. The runtime Temporal API isn't shipped
// in browsers yet (Stage 3 proposal); the polyfill makes it available globally.
// Lib-types prefer the built-in, but the polyfill is API-compatible at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T = Temporal as any;
import { Menu } from "@headlessui/react";
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "@/components/icons/lucide-shim";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
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
  const { data: tasksRes, mutate: refetchTasks } = useSWR(
    workspaceSlug ? `CALENDAR_TASKS_${workspaceSlug}` : null,
    () => calendarService.tasks(workspaceSlug, taskRange)
  );

  // "Quick add" task: opened via Schedule-X day-click. Holds the date the
  // user clicked so we can preload the CreateUpdateIssueModal.
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

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
  const calendarControls = useRef(createCalendarControlsPlugin()).current;
  const calendarAppRef = useRef<ReturnType<typeof createCalendar> | null>(null);
  // Tracks the calendar's current view + visible month so the custom toolbar
  // can render the right label and active state without polling the plugin.
  const [view, setViewState] = useState<string>("month-grid");
  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;
  });

  // Keep the latest setQuickAddDate accessible from the (one-time) Schedule-X
  // callbacks closure — we don't want to recreate the calendar on every render.
  const openQuickAddRef = useRef<(date: string) => void>(() => {});
  openQuickAddRef.current = (date) => setQuickAddDate(date);

  if (!calendarAppRef.current) {
    calendarAppRef.current = createCalendar({
      views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
      defaultView: createViewMonthGrid().name,
      events: sxEvents,
      calendars: CALENDARS_CONFIG,
      plugins: [eventsService, calendarControls],
      callbacks: {
        onClickDate: (date) => openQuickAddRef.current(typeof date === "string" ? date.slice(0, 10) : ""),
        onClickDateTime: (dateTime) =>
          openQuickAddRef.current(typeof dateTime === "string" ? dateTime.slice(0, 10) : ""),
        onRangeUpdate: () => {
          // Fires when navigation moves to a different month/week/day. Use it
          // to re-derive the visible-month label for our custom toolbar.
          try {
            const cur = calendarControls.getDate();
            const d = new Date(cur.toString());
            setVisibleMonth(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`);
          } catch {
            // ignore — plugin not ready
          }
        },
      },
    });
  }

  const handleViewChange = (next: string) => {
    calendarControls.setView(next);
    setViewState(next);
  };
  const handleSetDate = (d: Date) => {
    const iso = d.toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
    if (!GlobalT) return;
    calendarControls.setDate(GlobalT.PlainDate.from(iso));
    setVisibleMonth(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`);
  };
  const handleToday = () => handleSetDate(new Date());
  const handleStep = (delta: -1 | 1) => {
    const cur = calendarControls.getDate();
    const d = new Date(cur.toString());
    if (view === "month-grid") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    handleSetDate(d);
  };

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
        onQuickAdd={() => setQuickAddDate(new Date().toISOString().slice(0, 10))}
      />
      <CalendarToolbar
        view={view}
        visibleMonth={visibleMonth}
        onToday={handleToday}
        onPrev={() => handleStep(-1)}
        onNext={() => handleStep(1)}
        onViewChange={handleViewChange}
      />
      <div className="dragonfruit-calendar relative h-full w-full flex-1 overflow-hidden">
        {calendarAppRef.current && <ScheduleXCalendar calendarApp={calendarAppRef.current} />}
      </div>

      {/* Click-a-day → quick-create task. The existing CreateUpdateIssueModal
          handles project selection, validation, and submit; we just preload
          the date the user clicked into. */}
      <CreateUpdateIssueModal
        isOpen={quickAddDate !== null}
        onClose={() => setQuickAddDate(null)}
        onSubmit={async () => {
          await refetchTasks();
        }}
        data={
          quickAddDate
            ? {
                start_date: quickAddDate,
                target_date: quickAddDate,
              }
            : undefined
        }
      />
    </div>
  );
}

type CalendarHeaderProps = {
  workspaceSlug: string;
  taskCount: number;
  googleAccount: TCalendarAccount | undefined;
  refetchAccounts: () => void;
  onQuickAdd: () => void;
};

function CalendarHeader({ taskCount, googleAccount, refetchAccounts, workspaceSlug, onQuickAdd }: CalendarHeaderProps) {
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
        <button
          type="button"
          onClick={onQuickAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3.5" />
          New task
        </button>
        {googleAccount ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <Trash2 className="size-3.5" />
            Disconnect Google
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="inline-flex items-center gap-1.5 rounded-md border border-subtle-1 bg-canvas px-2.5 py-1 text-xs font-medium text-primary hover:bg-layer-1-hover disabled:opacity-50"
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

// ── Custom toolbar ────────────────────────────────────────────────────────
// Schedule-X's stock toolbar uses Material Design widgets. We hide it via
// CSS and render this in its place so View / Date / chevrons all match
// DragonFruit's design system.

type ToolbarProps = {
  view: string;
  visibleMonth: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onViewChange: (next: string) => void;
};

const VIEW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "month-grid", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

function CalendarToolbar({ view, visibleMonth, onToday, onPrev, onNext, onViewChange }: ToolbarProps) {
  const currentViewLabel = VIEW_OPTIONS.find((o) => o.value === view)?.label ?? "Month";
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          className="rounded-md border border-subtle-1 bg-canvas px-3 py-1 text-13 font-medium text-primary hover:bg-layer-1-hover"
        >
          Today
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="ml-1 text-15 font-medium text-primary">{visibleMonth}</div>
      </div>
      <Menu as="div" className="relative">
        <Menu.Button className="inline-flex items-center gap-1.5 rounded-md border border-subtle-1 bg-canvas px-2.5 py-1 text-13 font-medium text-primary hover:bg-layer-1-hover">
          {currentViewLabel}
          <ChevronDown className="size-3.5 text-tertiary" />
        </Menu.Button>
        <Menu.Items className="absolute right-0 z-30 mt-1 w-32 rounded-md border border-subtle-1 bg-canvas py-1 shadow-lg outline-none">
          {VIEW_OPTIONS.map((opt) => (
            <Menu.Item key={opt.value}>
              <button
                type="button"
                onClick={() => onViewChange(opt.value)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-layer-1-hover"
              >
                {opt.label}
                {view === opt.value && <Check className="size-3.5 text-tertiary" />}
              </button>
            </Menu.Item>
          ))}
        </Menu.Items>
      </Menu>
    </div>
  );
}
