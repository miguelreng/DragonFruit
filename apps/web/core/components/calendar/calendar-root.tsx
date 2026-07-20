/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createCalendar, createViewDay, createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import { createCurrentTimePlugin } from "@schedule-x/current-time";
import { createScrollControllerPlugin } from "@schedule-x/scroll-controller";
// reason: side-effect CSS import
// eslint-disable-next-line import/no-unassigned-import
import "@schedule-x/theme-default/dist/index.css";

import { Combobox, Menu } from "@headlessui/react";
import {
  Calendar as CalendarIcon,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Earth,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Trash2,
} from "@/components/icons/lucide-shim";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, EModalWidth, Header, ModalCore } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import {
  CalendarService,
  type TCalendarAccount,
  type TCalendarEvent,
  type TCalendarTask,
  type TGoogleCalendar,
} from "@/services/calendar.service";
import { IssueService } from "@/services/issue/issue.service";

const calendarService = new CalendarService();
const issueService = new IssueService();
const TASKS_CALENDAR_ID = "tasks";
// Calendar-only accent: a brighter pink than the deep brand magenta (by request),
// scoped to the calendar. Header chrome (New button, legend dot) renders OUTSIDE the
// `.dragonfruit-calendar` wrapper, so it can't read the CSS var and uses this hex
// directly — keep it in sync with `--dragonfruit-calendar-accent` in globals.css.
const CALENDAR_ACCENT = "#ec4899";
const CreateUpdateIssueModal = lazy(() =>
  import("@/components/issues/issue-modal/modal").then((module) => ({ default: module.CreateUpdateIssueModal }))
);
const IssuePeekOverview = lazy(() =>
  import("@/components/issues/peek-overview").then((module) => ({ default: module.IssuePeekOverview }))
);
type TGoogleCalendarSource = {
  id: string;
  account: TCalendarAccount;
  calendar: TGoogleCalendar;
  accountIndex: number;
  calendarIndex: number;
};
type TCalendarEventWithSource = TCalendarEvent & {
  sourceId: string;
  accountId: string;
  accountEmail: string;
  calendarId: string;
  calendarName: string;
};
type TCalendarPrefs = Record<string, { visible: boolean; color: string }>;
type TDragonfruitEventMeta =
  | { kind: "task"; projectId: string | null; taskId: string; workspaceSlug: string }
  | { kind: "google_event"; event: TCalendarEventWithSource };
type TScheduleXEvent = NonNullable<ReturnType<ReturnType<typeof createEventsServicePlugin>["get"]>>;
type TCalendarDropLocation = {
  date: string;
  minuteOfDay: number | null;
  element: HTMLElement;
};

const GOOGLE_COLORS = ["#2563eb", "#0f9f6e", "#f97316", "#7c3aed", "#0891b2", "#be123c"];
// Stable fallbacks for SWR destructuring defaults. An inline `= []` default is
// a NEW identity every render, which cascades through visibleGoogleSources →
// calendarsConfig → the createCalendar memo — recreating the whole Schedule-X
// app (and resetting its date to today) on every React state change.
const EMPTY_GOOGLE_SOURCES: TGoogleCalendarSource[] = [];
const EMPTY_GOOGLE_EVENTS: TCalendarEventWithSource[] = [];
const CALENDAR_PREFS_KEY = "dragonfruit.calendar.googlePrefs";
const SHOW_TASKS_KEY = "dragonfruit.calendar.showTasks";
const TIMEZONE_KEY = "dragonfruit.calendar.timezone";

const getBrowserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const getAvailableTimezones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [getBrowserTimezone(), "UTC"];
  }
};

// "GMT-5" for an arbitrary IANA zone (not just the browser's).
function timezoneOffsetLabel(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function timezoneCityLabel(timeZone: string) {
  return timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
}

type TCalendarView = "month-grid" | "week" | "day";
const CALENDAR_VIEW_OPTIONS: { value: TCalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month-grid", label: "Month" },
];

const shortMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });

// Local date components — toISOString() would shift the day for users in
// negative-offset timezones.
const toLocalDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Clicking a date-axis header jumps to the day view for that date. The header
// components render through portals from a module-stable customComponents
// object, so they reach CalendarRoot via a window CustomEvent (same pattern
// as the editor's block comments).
const OPEN_DAY_EVENT = "dragonfruit:calendar-open-day";

// Week/day date axis header: day name and number on one line, today's number
// in an accent pill. Rendered through the React-adapter portals — the
// customComponents object must stay referentially stable or the adapter
// destroys/recreates the calendar on every render.
function WeekGridDateHeader({ date }: { date: string }) {
  const day = new Date(`${date}T00:00:00`);
  const isToday = date === toLocalDateString(new Date());
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_DAY_EVENT, { detail: date }))}
      title="Open day view"
      className="group/date flex w-full items-center justify-center gap-1.5 py-1.5"
    >
      <span className="text-11 font-medium text-tertiary">{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
      {/* font-weight matches the month grid's date numbers (regular). */}
      <span
        className={`df-week-date-pill grid size-6 place-items-center text-12 ${
          isToday ? "text-white" : "text-primary group-hover/date:bg-layer-2-hover"
        }`}
        style={isToday ? { backgroundColor: CALENDAR_ACCENT } : undefined}
      >
        {day.getDate()}
      </span>
    </button>
  );
}

// Referentially stable — see the WeekGridDateHeader note above.
const CALENDAR_CUSTOM_COMPONENTS = { weekGridDate: WeekGridDateHeader };

// Corner badge over the week/day time axis: the CALENDAR's display timezone
// (offset + zone city), like the reference's "PST -8 / California".
function CalendarTimezoneBadge({ timezone }: { timezone: string }) {
  return (
    <div className="pointer-events-none absolute top-2 left-0 z-10 flex w-14 flex-col items-center gap-0.5 text-center leading-tight">
      <span className="text-11 font-semibold text-secondary">{timezoneOffsetLabel(timezone)}</span>
      <span className="text-[10px] text-tertiary">{timezoneCityLabel(timezone)}</span>
    </div>
  );
}

// Toolbar label per view: month = "July 2026", day = "July 19, 2026",
// week = the visible range ("Jul 13 – 19, 2026", "Jun 29 – Jul 5, 2026", …).
function formatToolbarLabel(view: string, current: Date, rangeStart: string | null, rangeEnd: string | null) {
  if (view === "day") {
    return current.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "week" && rangeStart && rangeEnd) {
    const start = new Date(`${rangeStart}T00:00:00`);
    const end = new Date(`${rangeEnd}T00:00:00`);
    const sameYear = start.getFullYear() === end.getFullYear();
    if (sameYear && start.getMonth() === end.getMonth()) {
      return `${shortMonth(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (sameYear) {
      return `${shortMonth(start)} ${start.getDate()} – ${shortMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${shortMonth(start)} ${start.getDate()}, ${start.getFullYear()} – ${shortMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${current.toLocaleString("en-US", { month: "long" })} ${current.getFullYear()}`;
}

// Schedule-X v4: events use Temporal types. All-day -> PlainDate; timed -> ZonedDateTime.
// We pull Temporal off the global (the same namespace Schedule-X's instanceof
// checks read from) to guarantee constructor identity.
function toTemporal(iso: string, allDay: boolean) {
  if (!iso) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
  if (!GlobalT) return null;
  const dateOnly = allDay || iso.length === 10;
  try {
    if (dateOnly) {
      return GlobalT.PlainDate.from(iso.slice(0, 10));
    }

    const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(iso);
    if (hasOffset) {
      const normalized = iso.endsWith("Z") ? iso : iso.replace(/([+-]\d{2}:\d{2})$/, "$1");
      return GlobalT.Instant.from(normalized).toZonedDateTimeISO("UTC");
    }

    return GlobalT.PlainDateTime.from(iso).toZonedDateTime("UTC", { disambiguation: "compatible" });
  } catch (err) {
    console.warn("Skipping calendar item with invalid date", { iso, allDay, err });
    return null;
  }
}

function googleAllDayInclusiveEnd(iso: string) {
  if (!iso) return iso;
  try {
    return Temporal.PlainDate.from(iso.slice(0, 10)).subtract({ days: 1 }).toString();
  } catch {
    return iso;
  }
}

function moveScheduleXEvent(
  event: TScheduleXEvent,
  drop: Pick<TCalendarDropLocation, "date" | "minuteOfDay">,
  timezone: string
): TScheduleXEvent | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
  if (!GlobalT) return null;

  try {
    const isAllDay = event.start.toString().length === 10;
    if (isAllDay) {
      const oldStart = GlobalT.PlainDate.from(event.start.toString());
      const oldEnd = GlobalT.PlainDate.from(event.end.toString());
      const newStart = GlobalT.PlainDate.from(drop.date);
      return { ...event, start: newStart, end: newStart.add(oldStart.until(oldEnd)) };
    }

    const oldStart = GlobalT.ZonedDateTime.from(event.start.toString());
    const oldEnd = GlobalT.ZonedDateTime.from(event.end.toString());
    const displayStart = oldStart.withTimeZone(timezone);
    const minuteOfDay = drop.minuteOfDay ?? displayStart.hour * 60 + displayStart.minute;
    const newDate = GlobalT.PlainDate.from(drop.date);
    const newStart = newDate.toZonedDateTime({
      timeZone: timezone,
      plainTime: GlobalT.PlainTime.from({
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
      }),
    });
    const durationMilliseconds = Number(oldEnd.epochNanoseconds - oldStart.epochNanoseconds) / 1_000_000;
    return { ...event, start: newStart, end: newStart.add({ milliseconds: durationMilliseconds }) };
  } catch (err) {
    console.error("Could not calculate the new calendar event time", err);
    return null;
  }
}

function getCalendarDropLocation(wrapper: HTMLElement, clientX: number, clientY: number): TCalendarDropLocation | null {
  const findCell = (selector: string) =>
    Array.from(wrapper.querySelectorAll<HTMLElement>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });

  const monthCell = findCell(".sx__month-grid-day[data-date]");
  if (monthCell) {
    return { date: monthCell.dataset.date ?? "", minuteOfDay: null, element: monthCell };
  }

  const allDayCell = findCell(".sx__date-grid-day[data-date-grid-date]");
  if (allDayCell) {
    return { date: allDayCell.dataset.dateGridDate ?? "", minuteOfDay: null, element: allDayCell };
  }

  const timeCell = findCell(".sx__time-grid-day[data-time-grid-date]");
  if (!timeCell) return null;
  const rect = timeCell.getBoundingClientRect();
  const rawMinutes = ((clientY - rect.top) / rect.height) * 24 * 60;
  const snappedMinutes = Math.round(rawMinutes / 15) * 15;
  return {
    date: timeCell.dataset.timeGridDate ?? "",
    minuteOfDay: Math.max(0, Math.min(23 * 60 + 45, snappedMinutes)),
    element: timeCell,
  };
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
    title: t.title,
    start,
    end,
    calendarId: TASKS_CALENDAR_ID,
    description: t.state_name ? `Status: ${t.state_name}` : "",
    _dragonfruit: { kind: "task" as const, projectId: t.project_id, taskId: t.id, workspaceSlug },
  };
}

function calendarAccountLabel(account: TCalendarAccount) {
  return account.account_email || "Google Calendar";
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function toSafeScheduleXIdPart(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "id";
}

function toSafeScheduleXId(prefix: string, rawValue: string): string {
  return `${prefix}-${toSafeScheduleXIdPart(rawValue)}-${stableHash(rawValue)}`;
}

function googleCalendarSourceId(accountId: string, calendarId: string) {
  return toSafeScheduleXId(`google-${accountId}`, calendarId);
}

function loadCalendarPrefs(): TCalendarPrefs {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CALENDAR_PREFS_KEY) || "{}") as TCalendarPrefs;
  } catch {
    return {};
  }
}

function saveCalendarPrefs(prefs: TCalendarPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify(prefs));
}

function googleSourceColor(source: TGoogleCalendarSource, prefs: TCalendarPrefs) {
  return (
    prefs[source.id]?.color ||
    source.calendar.background_color ||
    GOOGLE_COLORS[(source.accountIndex + source.calendarIndex) % GOOGLE_COLORS.length] ||
    "#2563eb"
  );
}

function isGoogleSourceVisible(source: TGoogleCalendarSource, prefs: TCalendarPrefs) {
  return prefs[source.id]?.visible ?? source.calendar.selected ?? true;
}

function googleSourceLabel(source: TGoogleCalendarSource) {
  const summary = source.calendar.summary?.trim();
  const accountEmail = calendarAccountLabel(source.account);
  const isGenericSummary =
    !summary ||
    summary.toLowerCase() === "google calendar" ||
    summary === source.calendar.id ||
    source.calendar.primary;
  return isGenericSummary ? accountEmail : summary;
}

function googleEventToScheduleXEvent(e: TCalendarEventWithSource) {
  const start = toTemporal(e.start, e.all_day);
  // Google's all-day end is exclusive; Schedule-X's is inclusive.
  const end = toTemporal(e.all_day ? googleAllDayInclusiveEnd(e.end) : e.end, e.all_day);
  if (!start || !end) return null;
  return {
    id: toSafeScheduleXId(`gcal-${e.sourceId}`, e.id),
    title: e.title,
    start,
    end,
    calendarId: e.sourceId,
    description: `${e.calendarName}${e.accountEmail ? ` · ${e.accountEmail}` : ""}${
      e.description ? `\n\n${e.description}` : ""
    }`,
    location: e.location,
    _dragonfruit: { kind: "google_event" as const, event: e },
  };
}

// `onContainer` is set to the calendar's `main` color; event labels are
// forced to neutral text colors via CSS (globals.css), so the calendar color
// only shows through the tinted container background.
//
// Color values here are a fallback — the authoritative ones live in globals.css
// (`--dragonfruit-calendar-accent`), which overrides what Schedule-X writes to
// :root and applies without recreating the calendar. Kept in sync via CALENDAR_ACCENT.
const BASE_CALENDARS_CONFIG = {
  [TASKS_CALENDAR_ID]: {
    colorName: "tasks",
    lightColors: {
      main: CALENDAR_ACCENT,
      container: `color-mix(in srgb, ${CALENDAR_ACCENT} 14%, transparent)`,
      onContainer: CALENDAR_ACCENT,
    },
    darkColors: {
      main: CALENDAR_ACCENT,
      container: `color-mix(in srgb, ${CALENDAR_ACCENT} 24%, transparent)`,
      onContainer: CALENDAR_ACCENT,
    },
  },
};

export function CalendarRoot() {
  const { workspaceSlug } = useParams() as { workspaceSlug: string };
  const { setPeekIssue } = useIssueDetail();

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
  const [quickAddSeed, setQuickAddSeed] = useState<{
    name?: string;
    description_html?: string;
    start_date: string;
    target_date: string;
  } | null>(null);
  const [hasOpenedIssuePeek, setHasOpenedIssuePeek] = useState(false);

  // Google: optional overlay.
  const { data: accounts, mutate: refetchAccounts } = useSWR<TCalendarAccount[]>("CALENDAR_ACCOUNTS", () =>
    calendarService.list()
  );
  const googleAccounts = useMemo(() => accounts ?? [], [accounts]);
  const [calendarPrefs, setCalendarPrefs] = useState<TCalendarPrefs>(() => loadCalendarPrefs());
  const { data: googleSources = EMPTY_GOOGLE_SOURCES } = useSWR<TGoogleCalendarSource[]>(
    googleAccounts.length > 0 ? `CALENDAR_SOURCES_${googleAccounts.map((account) => account.id).join("_")}` : null,
    async () => {
      const results = await Promise.all(
        googleAccounts.map(async (account, accountIndex) => {
          let calendars;
          try {
            const res = await calendarService.calendars(account.id);
            calendars = res.calendars;
          } catch (err) {
            console.warn("Falling back to primary Google calendar", { accountId: account.id, err });
            calendars = [
              {
                id: account.primary_calendar_id || "primary",
                summary: calendarAccountLabel(account),
                description: "",
                background_color: "",
                foreground_color: "",
                primary: true,
                selected: true,
                access_role: "",
              },
            ];
          }
          return (calendars ?? []).map((calendar, calendarIndex) => ({
            id: googleCalendarSourceId(account.id, calendar.id),
            account,
            calendar,
            accountIndex,
            calendarIndex,
          }));
        })
      );
      return results.flat();
    }
  );
  const visibleGoogleSources = useMemo(
    () => googleSources.filter((source) => isGoogleSourceVisible(source, calendarPrefs)),
    [googleSources, calendarPrefs]
  );
  // Calendars the user can write to — needed to create events on them.
  const writableSources = useMemo(
    () => googleSources.filter((source) => ["writer", "owner"].includes(source.calendar.access_role)),
    [googleSources]
  );
  const writableSourceIds = useMemo(() => new Set(writableSources.map((source) => source.id)), [writableSources]);
  const updateCalendarPrefs = useCallback(
    (source: TGoogleCalendarSource, patch: Partial<{ visible: boolean; color: string }>) => {
      setCalendarPrefs((current) => {
        const next = {
          ...current,
          [source.id]: {
            visible: current[source.id]?.visible ?? true,
            color: current[source.id]?.color || googleSourceColor(source, current),
            ...patch,
          },
        };
        saveCalendarPrefs(next);
        return next;
      });
    },
    []
  );
  const calendarsConfig = useMemo(() => {
    const googleCalendars = Object.fromEntries(
      visibleGoogleSources.map((source) => {
        const color = googleSourceColor(source, calendarPrefs);
        return [
          source.id,
          {
            colorName: source.id,
            lightColors: { main: color, container: `${color}1f`, onContainer: color },
            darkColors: { main: color, container: `${color}33`, onContainer: color },
          },
        ];
      })
    );
    return { ...BASE_CALENDARS_CONFIG, ...googleCalendars };
  }, [calendarPrefs, visibleGoogleSources]);

  const { data: googleEvents = EMPTY_GOOGLE_EVENTS, mutate: refetchGoogleEvents } = useSWR<TCalendarEventWithSource[]>(
    visibleGoogleSources.length > 0
      ? `CALENDAR_EVENTS_${taskRange.from}_${taskRange.to}_${visibleGoogleSources.map((source) => source.id).join("_")}`
      : null,
    async () => {
      const results = await Promise.all(
        visibleGoogleSources.map(async (source) => {
          let res: { events: TCalendarEvent[] };
          try {
            res = await calendarService.events(source.account.id, {
              ...taskRange,
              calendar_id: source.calendar.id,
            });
          } catch (err) {
            console.warn("Could not load Google Calendar events", {
              accountId: source.account.id,
              calendarId: source.calendar.id,
              err,
            });
            return [];
          }
          return (res.events ?? []).map((event) =>
            Object.assign({}, event, {
              sourceId: source.id,
              accountId: source.account.id,
              accountEmail: source.account.account_email,
              calendarId: source.calendar.id,
              calendarName: googleSourceLabel(source),
            })
          );
        })
      );
      return results.flat();
    },
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    }
  );

  // Display timezone: every timed event is converted to this zone (Schedule-X
  // `timezone` config). Defaults to the browser's zone — NOT Schedule-X's UTC
  // default, which silently rendered offset-carrying Google times in UTC.
  const [calendarTimezone, setCalendarTimezone] = useState<string>(() => {
    if (typeof window === "undefined") return getBrowserTimezone();
    return window.localStorage.getItem(TIMEZONE_KEY) || getBrowserTimezone();
  });
  const handleChangeTimezone = useCallback((timezone: string) => {
    window.localStorage.setItem(TIMEZONE_KEY, timezone);
    setCalendarTimezone(timezone);
  }, []);

  // Header toggle: show/hide DragonFruit tasks on the grid (Google events stay).
  const [showTasks, setShowTasks] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SHOW_TASKS_KEY) !== "false";
  });
  const handleToggleTasks = useCallback(() => {
    setShowTasks((current) => {
      window.localStorage.setItem(SHOW_TASKS_KEY, String(!current));
      return !current;
    });
  }, []);

  const sxEvents = useMemo(() => {
    const taskEvents = showTasks
      ? (tasksRes?.tasks ?? [])
          .map((t) => taskToScheduleXEvent(t, workspaceSlug))
          .filter((e): e is NonNullable<typeof e> => e !== null)
      : [];
    const gEvents = googleEvents.map(googleEventToScheduleXEvent).filter((e): e is NonNullable<typeof e> => e !== null);
    return [...taskEvents, ...gEvents];
  }, [tasksRes, googleEvents, showTasks, workspaceSlug]);

  const eventsService = useRef(createEventsServicePlugin()).current;
  const calendarControls = useRef(createCalendarControlsPlugin()).current;
  const suppressEventClickUntilRef = useRef(0);
  const persistCalendarMoveRef = useRef<
    (originalEvent: TScheduleXEvent, updatedEvent: TScheduleXEvent) => Promise<void>
  >(async () => {});
  persistCalendarMoveRef.current = async (originalEvent, updatedEvent) => {
    const meta = originalEvent._dragonfruit as TDragonfruitEventMeta | undefined;
    if (!meta) throw new Error("Calendar item metadata is missing");

    if (meta.kind === "task") {
      if (!meta.projectId) throw new Error("This task is not attached to a project");
      await issueService.patchIssue(meta.workspaceSlug, meta.projectId, meta.taskId, {
        start_date: updatedEvent.start.toString().slice(0, 10),
        target_date: updatedEvent.end.toString().slice(0, 10),
      });
      await refetchTasks();
      return;
    }

    const allDay = updatedEvent.start.toString().length === 10;
    const start = allDay
      ? updatedEvent.start.toString().slice(0, 10)
      : Temporal.ZonedDateTime.from(updatedEvent.start.toString()).toInstant().toString();
    const end = allDay
      ? updatedEvent.end.toString().slice(0, 10)
      : Temporal.ZonedDateTime.from(updatedEvent.end.toString()).toInstant().toString();
    await calendarService.updateEvent(meta.event.accountId, {
      event_id: meta.event.id,
      calendar_id: meta.event.calendarId,
      all_day: allDay,
      start,
      end,
      time_zone: calendarTimezone,
    });
    await refetchGoogleEvents();
  };
  // Week/day views only: the "now" line across the time grid, and an initial
  // scroll to the working morning instead of midnight.
  const currentTimePlugin = useRef(createCurrentTimePlugin({ fullWeekWidth: true })).current;
  const scrollController = useRef(createScrollControllerPlugin({ initialScroll: "07:00" })).current;
  const calendarConfigKey = useMemo(
    () =>
      JSON.stringify(
        visibleGoogleSources.map((source) => [
          source.id,
          isGoogleSourceVisible(source, calendarPrefs),
          googleSourceColor(source, calendarPrefs),
        ])
      ),
    [calendarPrefs, visibleGoogleSources]
  );
  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;
  });
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [activeView, setActiveView] = useState<TCalendarView>("month-grid");
  // Read at createCalendar time so a config-driven recreate keeps the view.
  const activeViewRef = useRef<TCalendarView>("month-grid");
  activeViewRef.current = activeView;

  // Toolbar label depends on the current view + date + visible range; the
  // Schedule-X callbacks close over the first render, so route through a ref.
  const syncToolbarLabelRef = useRef<() => void>(() => {});
  syncToolbarLabelRef.current = () => {
    try {
      const view = calendarControls.getView();
      // If Schedule-X ever changes the view on its own, keep the switcher honest.
      setActiveView((prev) => (prev === view ? prev : (view as TCalendarView)));
      // Parse as LOCAL midnight — bare "YYYY-MM-DD" parses as UTC and shows
      // yesterday's date in negative-offset timezones.
      const current = new Date(`${calendarControls.getDate().toString().slice(0, 10)}T00:00:00`);
      let rangeStart: string | null = null;
      let rangeEnd: string | null = null;
      try {
        const range = calendarControls.getRange();
        if (range) {
          rangeStart = range.start.toString().slice(0, 10);
          rangeEnd = range.end.toString().slice(0, 10);
        }
      } catch {
        // ignore — range not available yet
      }
      setVisibleMonth(formatToolbarLabel(view, current, rangeStart, rangeEnd));
    } catch {
      // ignore — plugin not ready
    }
  };

  // Keep the latest setQuickAddDate accessible from the (one-time) Schedule-X
  // callbacks closure — we don't want to recreate the calendar on every render.
  const openQuickAddRef = useRef<(date: string) => void>(() => {});
  openQuickAddRef.current = (date) => setQuickAddDate(date);
  // Google events open a read-only details modal; "Create task" inside it
  // seeds the quick-add task modal with the event's content.
  const [googleEventDetails, setGoogleEventDetails] = useState<TCalendarEventWithSource | null>(null);
  const seedTaskFromEvent = useCallback((e: TCalendarEventWithSource) => {
    const start = e.start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const end = e.end?.slice(0, 10) ?? start;
    setQuickAddSeed({
      name: e.title,
      description_html: e.description || "",
      start_date: start,
      target_date: end,
    });
    setQuickAddDate(start);
  }, []);

  // Same trick for opening a clicked calendar item — the closure inside
  // createCalendar captures the *first* render's setPeekIssue, so we route
  // through a ref. Also reused by the day-events overflow modal.
  const openCalendarItemRef = useRef<(meta: TDragonfruitEventMeta | undefined) => void>(() => {});
  openCalendarItemRef.current = (meta) => {
    if (meta?.kind === "task") {
      if (!meta.projectId) return;
      setHasOpenedIssuePeek(true);
      setPeekIssue({ workspaceSlug, projectId: meta.projectId, issueId: meta.taskId });
      return;
    }
    if (meta?.kind === "google_event") {
      setGoogleEventDetails(meta.event);
    }
  };
  // "+ N events" in the month grid: Schedule-X's default is to switch to the
  // Day view; we keep our own day-events modal instead (with hover preview).
  const [dayEventsDate, setDayEventsDate] = useState<string | null>(null);
  // Hovering the "+ N events" chip shows a floating preview of that day's
  // events (with start–end times) without having to click.
  const [dayPreview, setDayPreview] = useState<{ date: string; left: number; top: number; openUp: boolean } | null>(
    null
  );
  const dayPreviewCloseTimer = useRef<number | null>(null);
  const cancelDayPreviewClose = useCallback(() => {
    if (dayPreviewCloseTimer.current !== null) {
      window.clearTimeout(dayPreviewCloseTimer.current);
      dayPreviewCloseTimer.current = null;
    }
  }, []);
  const scheduleDayPreviewClose = useCallback(() => {
    cancelDayPreviewClose();
    dayPreviewCloseTimer.current = window.setTimeout(() => setDayPreview(null), 150);
  }, [cancelDayPreviewClose]);
  const openDayEventsRef = useRef<(date: string) => void>(() => {});
  openDayEventsRef.current = (date) => {
    setDayPreview(null);
    setDayEventsDate(date);
  };

  const calendarApp = useMemo(
    () =>
      createCalendar({
        views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
        defaultView: activeViewRef.current,
        // Schedule-X's responsive mode auto-switches to the day view whenever
        // the wrapper measures small (including the zero-width first layout),
        // desyncing our header switcher. Our own Month/Week/Day control is the
        // only thing that should change views.
        isResponsive: false,
        // Concurrent events split the slot width evenly (side-by-side columns)
        // instead of Schedule-X's default cascade overlap, which piles the
        // boxes on top of each other and garbles their labels.
        weekOptions: { eventOverlap: false },
        timezone: calendarTimezone,
        events: [],
        calendars: calendarsConfig,
        plugins: [eventsService, calendarControls, currentTimePlugin, scrollController],
        callbacks: {
          onClickDate: (date) => openQuickAddRef.current(typeof date === "string" ? date.slice(0, 10) : ""),
          onClickDateTime: (dateTime) =>
            openQuickAddRef.current(typeof dateTime === "string" ? dateTime.slice(0, 10) : ""),
          onEventClick: (event) => {
            if (Date.now() < suppressEventClickUntilRef.current) return;
            openCalendarItemRef.current((event as unknown as { _dragonfruit?: TDragonfruitEventMeta })._dragonfruit);
          },
          onClickPlusEvents: (date) => openDayEventsRef.current(date.toString().slice(0, 10)),
          onRangeUpdate: () => {
            // Fires when navigation or a view switch changes the visible range.
            // Use it to keep our custom toolbar label in sync with Schedule-X.
            syncToolbarLabelRef.current();
          },
        },
      }),
    [calendarControls, calendarsConfig, calendarTimezone, currentTimePlugin, eventsService, scrollController]
  );

  const handleSetDate = (d: Date) => {
    const iso = toLocalDateString(d);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
    if (!GlobalT) return;
    calendarControls.setDate(GlobalT.PlainDate.from(iso));
    // The day view renders from `range`, which setDate alone never recomputes
    // (month/week read selectedDate directly) — re-affirm the current view so
    // Today/prev/next move the day grid too. Same-name setView doesn't remount.
    try {
      calendarControls.setView(calendarControls.getView());
    } catch {
      // ignore — plugin not ready
    }
    setDayPreview(null);
    syncToolbarLabelRef.current();
  };
  const handleToday = () => handleSetDate(new Date());
  // Prev/next step by the active view's unit: a month, a week, or a day.
  const handleStep = (delta: -1 | 1) => {
    const cur = calendarControls.getDate();
    // Local midnight (see handleSetDate) so date math stays on local days.
    const d = new Date(`${cur.toString().slice(0, 10)}T00:00:00`);
    if (activeView === "week") d.setDate(d.getDate() + delta * 7);
    else if (activeView === "day") d.setDate(d.getDate() + delta);
    else d.setMonth(d.getMonth() + delta);
    handleSetDate(d);
  };
  // View switches re-apply the scroll controller's initialScroll on their own
  // (its internal view-change effect), so no manual scrolling is needed here.
  const handleChangeView = (view: TCalendarView) => {
    if (view === activeView) return;
    setActiveView(view);
    setDayPreview(null);
    calendarControls.setView(view);
    syncToolbarLabelRef.current();
  };

  // Clicking a date in the week/day axis header jumps to that day's day view.
  useEffect(() => {
    const handleOpenDay = (event: Event) => {
      const date = (event as CustomEvent<string>).detail;
      if (!date) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const GlobalT = (globalThis as any).Temporal as typeof Temporal | undefined;
      if (!GlobalT) return;
      // Switch view, set the date, then re-affirm the view: the day view only
      // re-ranges on setView (see handleSetDate), and a setView issued during
      // the week→day transition ranges from a stale date. The second call is
      // a no-op render-wise (same view name) but re-ranges to the new date.
      calendarControls.setView("day");
      calendarControls.setDate(GlobalT.PlainDate.from(date));
      calendarControls.setView("day");
      setActiveView("day");
      setDayPreview(null);
      syncToolbarLabelRef.current();
    };
    window.addEventListener(OPEN_DAY_EVENT, handleOpenDay);
    return () => window.removeEventListener(OPEN_DAY_EVENT, handleOpenDay);
  }, [calendarControls]);
  const handleRefreshCalendar = useCallback(async () => {
    if (isRefreshingCalendar) return;
    setIsRefreshingCalendar(true);
    try {
      await Promise.all([refetchTasks(), refetchGoogleEvents()]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Calendar refreshed",
      });
    } catch (err) {
      console.error("Could not refresh calendar", err);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't refresh calendar",
        message: "Try again in a moment.",
      });
    } finally {
      setIsRefreshingCalendar(false);
    }
  }, [isRefreshingCalendar, refetchGoogleEvents, refetchTasks]);

  useEffect(() => {
    if (!eventsService) return;
    // Re-apply events after calendar visibility/color/timezone changes
    // recreate the app (a fresh app starts with an empty events list).
    void calendarConfigKey;
    void calendarTimezone;
    eventsService.set(sxEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConfigKey, calendarTimezone, sxEvents]);

  // Events for a given day — used by the overflow modal and the hover preview.
  // Day membership mirrors the month grid: Schedule-X assigns events by the
  // date part of start/end.toString(), with the end date inclusive.
  const getEventsForDay = useCallback(
    (date: string) =>
      sxEvents
        .filter((ev) => {
          const start = ev.start.toString().slice(0, 10);
          const end = ev.end.toString().slice(0, 10);
          return start <= date && date <= end;
        })
        .sort((a, b) => {
          const aAllDay = a.start.toString().length === 10;
          const bAllDay = b.start.toString().length === 10;
          if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
          return a.start.toString().localeCompare(b.start.toString());
        }),
    [sxEvents]
  );
  const dayEvents = useMemo(
    () => (dayEventsDate ? getEventsForDay(dayEventsDate) : []),
    [dayEventsDate, getEventsForDay]
  );
  const dayPreviewEvents = useMemo(
    () => (dayPreview ? getEventsForDay(dayPreview.date) : []),
    [dayPreview, getEventsForDay]
  );

  // Delegated hover on the month grid's "+ N events" chips. Schedule-X owns
  // that DOM, so listen on our wrapper and resolve the day via the cell's
  // data-date attribute.
  const calendarWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrapper = calendarWrapperRef.current;
    if (!wrapper) return;
    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const chip = target?.closest?.(".sx__month-grid-day__events-more");
      if (!chip) return;
      const date = chip.closest("[data-date]")?.getAttribute("data-date");
      if (!date) return;
      cancelDayPreviewClose();
      const rect = chip.getBoundingClientRect();
      const PREVIEW_WIDTH = 320;
      const ESTIMATED_HEIGHT = 300;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - PREVIEW_WIDTH - 8));
      const openUp = rect.bottom + ESTIMATED_HEIGHT > window.innerHeight;
      setDayPreview({ date, left, top: openUp ? rect.top - 4 : rect.bottom + 4, openUp });
    };
    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.(".sx__month-grid-day__events-more")) return;
      scheduleDayPreviewClose();
    };
    wrapper.addEventListener("mouseover", handleMouseOver);
    wrapper.addEventListener("mouseout", handleMouseOut);
    return () => {
      wrapper.removeEventListener("mouseover", handleMouseOver);
      wrapper.removeEventListener("mouseout", handleMouseOut);
    };
  }, [cancelDayPreviewClose, scheduleDayPreviewClose]);

  // Schedule-X v4 moved its drag-and-drop plugin to a separate premium
  // package. Keep the same direct-manipulation behavior locally by delegating
  // native drag events from Schedule-X's rendered event nodes. The calendar's
  // events service provides the optimistic update; the source APIs remain the
  // authority and restore the original position if persistence fails.
  useEffect(() => {
    const wrapper = calendarWrapperRef.current;
    if (!wrapper) return;

    const movingEventIds = new Set<string>();
    let draggedEvent: { event: TScheduleXEvent; element: HTMLElement } | null = null;
    let currentDrop: TCalendarDropLocation | null = null;
    const dropIndicator = document.createElement("div");
    const dropIndicatorLabel = document.createElement("span");
    dropIndicator.className = "df-calendar-drop-indicator";
    dropIndicator.setAttribute("aria-hidden", "true");
    dropIndicator.hidden = true;
    dropIndicatorLabel.className = "df-calendar-drop-indicator-label";
    dropIndicator.appendChild(dropIndicatorLabel);
    wrapper.appendChild(dropIndicator);

    const isMovable = (event: TScheduleXEvent | undefined) => {
      const meta = event?._dragonfruit as TDragonfruitEventMeta | undefined;
      if (!meta) return false;
      if (meta.kind === "task") return Boolean(meta.projectId);
      return writableSourceIds.has(meta.event.sourceId);
    };

    const refreshDraggableEvents = () => {
      wrapper.querySelectorAll<HTMLElement>(".sx__event[data-event-id]").forEach((element) => {
        const eventId = element.dataset.eventId;
        const event = eventId ? eventsService.get(eventId) : undefined;
        const movable = Boolean(eventId && !movingEventIds.has(eventId) && isMovable(event));
        if (element.draggable !== movable) element.draggable = movable;
        element.classList.toggle("df-calendar-event-draggable", movable);
        if (movable) {
          const description = "Drag to move. Use Alt plus arrow keys to move without a mouse.";
          if (element.getAttribute("aria-description") !== description) {
            element.setAttribute("aria-description", description);
          }
        } else {
          element.removeAttribute("aria-description");
        }
      });
    };

    const setMovingState = (eventId: string, moving: boolean) => {
      wrapper.querySelectorAll<HTMLElement>(".sx__event[data-event-id]").forEach((element) => {
        if (element.dataset.eventId !== eventId) return;
        element.classList.toggle("df-calendar-event-saving", moving);
        if (moving) element.setAttribute("aria-busy", "true");
        else element.removeAttribute("aria-busy");
      });
    };

    const renderDropIndicator = (drop: TCalendarDropLocation) => {
      const date = new Date(`${drop.date}T00:00:00`);
      const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const wrapperRect = wrapper.getBoundingClientRect();
      const cellRect = drop.element.getBoundingClientRect();
      dropIndicator.style.left = `${cellRect.left - wrapperRect.left}px`;
      dropIndicator.style.width = `${cellRect.width}px`;
      dropIndicator.hidden = false;

      if (drop.minuteOfDay === null) {
        dropIndicator.classList.add("df-calendar-drop-indicator-all-day");
        dropIndicator.style.top = `${cellRect.top - wrapperRect.top}px`;
        dropIndicatorLabel.textContent = `${dateLabel} · All day`;
        return;
      }

      dropIndicator.classList.remove("df-calendar-drop-indicator-all-day");
      dropIndicator.style.top = `${
        cellRect.top - wrapperRect.top + (drop.minuteOfDay / (24 * 60)) * cellRect.height
      }px`;
      const hour = Math.floor(drop.minuteOfDay / 60);
      const minute = drop.minuteOfDay % 60;
      const timeLabel = new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      dropIndicatorLabel.textContent = `${dateLabel} · ${timeLabel}`;
    };

    const clearDropTarget = () => {
      currentDrop?.element.classList.remove("df-calendar-drop-target");
      currentDrop = null;
      dropIndicator.hidden = true;
    };

    const cleanUpDrag = () => {
      clearDropTarget();
      draggedEvent?.element.classList.remove("df-calendar-event-dragging");
      draggedEvent?.element.removeAttribute("aria-grabbed");
      draggedEvent = null;
    };

    const commitMove = async (originalEvent: TScheduleXEvent, updatedEvent: TScheduleXEvent) => {
      const eventId = String(originalEvent.id);
      if (
        movingEventIds.has(eventId) ||
        (originalEvent.start.toString() === updatedEvent.start.toString() &&
          originalEvent.end.toString() === updatedEvent.end.toString())
      ) {
        return;
      }

      movingEventIds.add(eventId);
      setMovingState(eventId, true);
      eventsService.update(updatedEvent);
      suppressEventClickUntilRef.current = Date.now() + 500;
      try {
        await persistCalendarMoveRef.current(originalEvent, updatedEvent);
        const meta = originalEvent._dragonfruit as TDragonfruitEventMeta | undefined;
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: meta?.kind === "task" ? "Task moved" : "Event moved",
        });
      } catch (err) {
        console.error("Could not move calendar item", err);
        eventsService.update(originalEvent);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Couldn't move this calendar item",
          message: "Its original date and time have been restored.",
        });
      } finally {
        movingEventIds.delete(eventId);
        setMovingState(eventId, false);
        refreshDraggableEvents();
      }
    };

    const handleDragStart = (event: DragEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(".sx__event[data-event-id]");
      const eventId = element?.dataset.eventId;
      const calendarEvent = eventId ? eventsService.get(eventId) : undefined;
      if (!element || !eventId || !calendarEvent || !isMovable(calendarEvent) || movingEventIds.has(eventId)) {
        event.preventDefault();
        return;
      }
      draggedEvent = { event: calendarEvent, element };
      element.classList.add("df-calendar-event-dragging");
      element.setAttribute("aria-grabbed", "true");
      event.dataTransfer?.setData("text/plain", eventId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      setDayPreview(null);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!draggedEvent) return;
      const nextDrop = getCalendarDropLocation(wrapper, event.clientX, event.clientY);
      if (!nextDrop?.date) {
        clearDropTarget();
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (currentDrop?.element !== nextDrop.element) {
        clearDropTarget();
        nextDrop.element.classList.add("df-calendar-drop-target");
      }
      currentDrop = nextDrop;
      renderDropIndicator(nextDrop);
    };

    const handleDrop = (event: DragEvent) => {
      if (!draggedEvent || !currentDrop) return;
      event.preventDefault();
      const originalEvent = draggedEvent.event;
      const updatedEvent = moveScheduleXEvent(originalEvent, currentDrop, calendarTimezone);
      cleanUpDrag();
      if (updatedEvent) void commitMove(originalEvent, updatedEvent);
    };

    const handleDragEnd = () => {
      if (draggedEvent) suppressEventClickUntilRef.current = Date.now() + 300;
      cleanUpDrag();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(".sx__event[data-event-id]");
      const eventId = element?.dataset.eventId;
      const originalEvent = eventId ? eventsService.get(eventId) : undefined;
      if (!eventId || !originalEvent || !isMovable(originalEvent) || movingEventIds.has(eventId)) return;

      event.preventDefault();
      const isAllDay = originalEvent.start.toString().length === 10;
      let date: string;
      let minuteOfDay: number | null = null;
      if (isAllDay) {
        const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        date = Temporal.PlainDate.from(originalEvent.start.toString()).add({ days: delta }).toString();
      } else {
        const displayStart = Temporal.ZonedDateTime.from(originalEvent.start.toString()).withTimeZone(calendarTimezone);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          date = displayStart
            .add({ days: event.key === "ArrowLeft" ? -1 : 1 })
            .toPlainDate()
            .toString();
        } else {
          const nextStart = displayStart.add({ minutes: event.key === "ArrowUp" ? -15 : 15 });
          date = nextStart.toPlainDate().toString();
          minuteOfDay = nextStart.hour * 60 + nextStart.minute;
        }
      }
      const updatedEvent = moveScheduleXEvent(originalEvent, { date, minuteOfDay }, calendarTimezone);
      if (updatedEvent) void commitMove(originalEvent, updatedEvent);
    };

    refreshDraggableEvents();
    const observer = new MutationObserver(refreshDraggableEvents);
    observer.observe(wrapper, { childList: true, subtree: true });
    wrapper.addEventListener("dragstart", handleDragStart);
    wrapper.addEventListener("dragover", handleDragOver);
    wrapper.addEventListener("drop", handleDrop);
    wrapper.addEventListener("dragend", handleDragEnd);
    wrapper.addEventListener("keydown", handleKeyDown);
    return () => {
      observer.disconnect();
      dropIndicator.remove();
      wrapper.removeEventListener("dragstart", handleDragStart);
      wrapper.removeEventListener("dragover", handleDragOver);
      wrapper.removeEventListener("drop", handleDrop);
      wrapper.removeEventListener("dragend", handleDragEnd);
      wrapper.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarTimezone, eventsService, writableSourceIds]);

  return (
    <>
      <AppHeader
        header={
          <CalendarPageHeader
            workspaceSlug={workspaceSlug}
            taskCount={tasksRes?.tasks?.length ?? 0}
            googleAccounts={googleAccounts}
            googleSources={googleSources}
            calendarPrefs={calendarPrefs}
            refetchAccounts={refetchAccounts}
            onUpdateCalendarPrefs={updateCalendarPrefs}
            onQuickAdd={() => setQuickAddDate(new Date().toISOString().slice(0, 10))}
            onNewEvent={() => setIsNewEventOpen(true)}
            canCreateEvent={writableSources.length > 0}
            visibleMonth={visibleMonth}
            onToday={handleToday}
            onPrev={() => handleStep(-1)}
            onNext={() => handleStep(1)}
            onRefresh={handleRefreshCalendar}
            isRefreshing={isRefreshingCalendar}
            activeView={activeView}
            onChangeView={handleChangeView}
            showTasks={showTasks}
            onToggleTasks={handleToggleTasks}
            calendarTimezone={calendarTimezone}
            onChangeTimezone={handleChangeTimezone}
          />
        }
      />
      <div ref={calendarWrapperRef} className="dragonfruit-calendar relative w-full flex-1 overflow-hidden">
        <ScheduleXCalendar
          key={calendarConfigKey}
          calendarApp={calendarApp}
          customComponents={CALENDAR_CUSTOM_COMPONENTS}
        />
        {activeView !== "month-grid" && <CalendarTimezoneBadge timezone={calendarTimezone} />}
      </div>
      {/* Hover a "+ N events" chip → floating preview of that day with
          start–end times. Rendered OUTSIDE .dragonfruit-calendar so the
          global `border-radius: 0` reset in there can't square it. */}
      {dayPreview !== null && (
        <DayEventsHoverCard
          date={dayPreview.date}
          events={dayPreviewEvents}
          calendarsConfig={calendarsConfig}
          left={dayPreview.left}
          top={dayPreview.top}
          openUp={dayPreview.openUp}
          onMouseEnter={cancelDayPreviewClose}
          onMouseLeave={scheduleDayPreviewClose}
          onSelectEvent={(meta) => {
            setDayPreview(null);
            openCalendarItemRef.current(meta);
          }}
        />
      )}

      {/* Click-a-day → quick-create task. The existing CreateUpdateIssueModal
          handles project selection, validation, and submit; we just preload
          the date the user clicked into. */}
      {quickAddDate !== null && (
        <Suspense fallback={null}>
          <CreateUpdateIssueModal
            isOpen
            onClose={() => {
              setQuickAddDate(null);
              setQuickAddSeed(null);
            }}
            onSubmit={async () => {
              await refetchTasks();
              setQuickAddSeed(null);
            }}
            data={
              quickAddSeed
                ? quickAddSeed
                : {
                    start_date: quickAddDate,
                    target_date: quickAddDate,
                  }
            }
          />
        </Suspense>
      )}
      {/* Click-a-task → open the standard peek-overview drawer. The store
          is global, so a single mount is enough for the whole calendar. */}
      {hasOpenedIssuePeek && (
        <Suspense fallback={null}>
          <IssuePeekOverview />
        </Suspense>
      )}
      <NewEventModal
        isOpen={isNewEventOpen}
        sources={writableSources}
        onClose={() => setIsNewEventOpen(false)}
        onCreated={() => {
          void refetchGoogleEvents();
        }}
      />
      {/* Click a Google event → read-only details view. */}
      {googleEventDetails !== null && (
        <GoogleEventDetailsModal
          event={googleEventDetails}
          canEdit={writableSourceIds.has(googleEventDetails.sourceId)}
          color={
            (calendarsConfig as Record<string, { lightColors: { main: string } }>)[googleEventDetails.sourceId]
              ?.lightColors.main ?? CALENDAR_ACCENT
          }
          timezone={calendarTimezone}
          onClose={() => setGoogleEventDetails(null)}
          onCreateTask={() => {
            const event = googleEventDetails;
            setGoogleEventDetails(null);
            seedTaskFromEvent(event);
          }}
          onUpdated={async (updatedEvent) => {
            setGoogleEventDetails((current) =>
              current?.id === updatedEvent.id ? { ...current, ...updatedEvent } : current
            );
            await refetchGoogleEvents();
          }}
        />
      )}
      {/* "+ N events" in a month cell → full list for that day. */}
      {dayEventsDate !== null && (
        <DayEventsModal
          date={dayEventsDate}
          events={dayEvents}
          calendarsConfig={calendarsConfig}
          onClose={() => setDayEventsDate(null)}
          onSelectEvent={(meta) => {
            setDayEventsDate(null);
            openCalendarItemRef.current(meta);
          }}
        />
      )}
    </>
  );
}

type CalendarPageHeaderProps = {
  workspaceSlug: string;
  taskCount: number;
  googleAccounts: TCalendarAccount[];
  googleSources: TGoogleCalendarSource[];
  calendarPrefs: TCalendarPrefs;
  refetchAccounts: () => void;
  onUpdateCalendarPrefs: (source: TGoogleCalendarSource, patch: Partial<{ visible: boolean; color: string }>) => void;
  onQuickAdd: () => void;
  onNewEvent: () => void;
  canCreateEvent: boolean;
  visibleMonth: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRefresh: () => void | Promise<void>;
  isRefreshing: boolean;
  activeView: TCalendarView;
  onChangeView: (view: TCalendarView) => void;
  showTasks: boolean;
  onToggleTasks: () => void;
  calendarTimezone: string;
  onChangeTimezone: (timezone: string) => void;
};

function CalendarPageHeader({
  taskCount,
  googleAccounts,
  googleSources,
  calendarPrefs,
  refetchAccounts,
  workspaceSlug,
  onUpdateCalendarPrefs,
  onQuickAdd,
  onNewEvent,
  canCreateEvent,
  visibleMonth,
  onToday,
  onPrev,
  onNext,
  onRefresh,
  isRefreshing,
  activeView,
  onChangeView,
  showTasks,
  onToggleTasks,
  calendarTimezone,
  onChangeTimezone,
}: CalendarPageHeaderProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const hasGoogleAccounts = googleAccounts.length > 0;

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
      const message =
        (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data?.details ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Try again in a moment.";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't start Google Calendar",
        message,
      });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (account: TCalendarAccount) => {
    if (!confirm(`Disconnect ${calendarAccountLabel(account)}?`)) return;
    await calendarService.disconnect(account.id);
    refetchAccounts();
  };

  return (
    <Header className="dragonfruit-calendar-toolbar">
      <Header.LeftItem className="min-w-0 flex-nowrap">
        <Breadcrumbs>
          <Breadcrumbs.Item component={<BreadcrumbLink label="Calendar" />} />
        </Breadcrumbs>
        <div className="ml-2 flex shrink-0 items-center gap-3 text-12 text-tertiary">
          {/* Legend chip doubles as the show/hide-tasks toggle. */}
          <Tooltip
            tooltipContent={showTasks ? "Hide tasks on the calendar" : "Show tasks on the calendar"}
            position="bottom-start"
          >
            <button
              type="button"
              onClick={onToggleTasks}
              aria-label={showTasks ? "Hide tasks on the calendar" : "Show tasks on the calendar"}
              aria-pressed={showTasks}
              className={`flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-layer-2-hover ${
                showTasks ? "" : "opacity-60"
              }`}
            >
              <LegendDot color={showTasks ? CALENDAR_ACCENT : "var(--text-color-tertiary)"} />
              <span className={`df-calendar-task-label ${showTasks ? "" : "line-through"}`}>{taskCount} tasks</span>
              {showTasks ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            </button>
          </Tooltip>
        </div>
      </Header.LeftItem>
      <Header.RightItem className="df-calendar-toolbar-controls items-center">
        {/* Recessed track + raised active chip so the current view reads at a glance. */}
        <div className="flex h-7 items-center gap-0.5 rounded-lg border border-strong bg-layer-1 p-0.5">
          {CALENDAR_VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangeView(option.value)}
              aria-pressed={activeView === option.value}
              className={`h-full rounded-md px-2.5 text-12 font-medium transition-colors ${
                activeView === option.value
                  ? "bg-surface-1 text-primary shadow-raised-100"
                  : "text-tertiary hover:text-secondary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="lg" onClick={onToday}>
          Today
        </Button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous"
            className="grid size-7 place-items-center rounded-lg text-tertiary hover:bg-layer-2-hover hover:text-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="grid size-7 place-items-center rounded-lg text-tertiary hover:bg-layer-2-hover hover:text-primary"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {/* Fixed width sized to the longest label (cross-year week ranges) so
            switching views doesn't reflow the controls around it. */}
        <span className="df-calendar-toolbar-date inline-block w-48 truncate px-1 text-center text-13 font-medium text-primary">
          {visibleMonth}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh calendar events"
          title="Refresh calendar events"
          className="grid size-7 place-items-center rounded-lg text-tertiary hover:bg-layer-2-hover hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
        <span className="bg-subtle mx-1 h-5 w-px" aria-hidden />
        <TimezoneMenu value={calendarTimezone} onChange={onChangeTimezone} />
        {hasGoogleAccounts ? (
          <GoogleAccountsMenu
            accounts={googleAccounts}
            sources={googleSources}
            calendarPrefs={calendarPrefs}
            onUpdateCalendarPrefs={onUpdateCalendarPrefs}
            onDisconnect={handleDisconnect}
            onAddCalendar={handleConnect}
            isConnecting={isConnecting}
          />
        ) : (
          <Button
            variant="secondary"
            size="lg"
            prependIcon={<CalendarIcon />}
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? "Redirecting…" : "Connect calendar"}
          </Button>
        )}
        {/* Always render the dropdown so the trigger doesn't morph from "New task"
            to "New ▾" once the writable-calendar state resolves after load. The
            "New event" item only appears when a writable Google calendar exists. */}
        <Menu as="div" className="relative">
          <Menu.Button
            className="t-press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-3 text-body-xs-medium whitespace-nowrap text-on-color hover:opacity-90"
            style={{ backgroundColor: CALENDAR_ACCENT }}
          >
            New
            <ChevronDown className="size-3.5" />
          </Menu.Button>
          <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-44 rounded-lg border border-strong bg-layer-2 py-1 outline-none">
            {canCreateEvent && (
              <Menu.Item>
                <button
                  type="button"
                  onClick={onNewEvent}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-13 text-primary hover:bg-layer-2-hover"
                >
                  <CalendarIcon className="size-3.5 text-tertiary" />
                  New event
                </button>
              </Menu.Item>
            )}
            <Menu.Item>
              <button
                type="button"
                onClick={onQuickAdd}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-13 text-primary hover:bg-layer-2-hover"
              >
                <CheckSquare className="size-3.5 text-tertiary" />
                New task
              </button>
            </Menu.Item>
          </Menu.Items>
        </Menu>
      </Header.RightItem>
    </Header>
  );
}

function TimezoneMenu({ value, onChange }: { value: string; onChange: (timezone: string) => void }) {
  const [query, setQuery] = useState("");
  const timezones = useMemo(() => getAvailableTimezones(), []);
  const filteredTimezones = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return timezones;
    return timezones.filter((timezone) => timezone.replace(/_/g, " ").toLowerCase().includes(normalizedQuery));
  }, [query, timezones]);

  return (
    <Combobox
      value={value}
      onChange={(timezone: string) => {
        onChange(timezone);
        setQuery("");
      }}
    >
      <div className="relative">
        <Combobox.Button
          aria-label="Calendar display timezone"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-strong bg-layer-2 px-2 text-body-xs-medium whitespace-nowrap text-secondary shadow-raised-100 hover:bg-layer-2-hover"
        >
          <Earth className="size-3.5 text-tertiary" />
          <span className="df-calendar-timezone-label">
            {timezoneOffsetLabel(value)} · {timezoneCityLabel(value)}
          </span>
          <ChevronDown className="size-3.5 text-tertiary" />
        </Combobox.Button>
        <Combobox.Options className="shadow-lg absolute right-0 z-30 mt-1 w-64 rounded-lg border border-strong bg-surface-1 p-2 outline-none">
          <div className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-2 px-2">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <Combobox.Input
              aria-label="Search timezones"
              className="w-full bg-transparent py-1.5 text-12 text-secondary placeholder:text-placeholder focus:outline-none"
              placeholder="Search timezones"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="vertical-scrollbar mt-2 max-h-64 space-y-0.5 overflow-y-auto">
            {filteredTimezones.map((timezone) => (
              <Combobox.Option
                key={timezone}
                value={timezone}
                className={({ active }) =>
                  `flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-12 select-none ${
                    active ? "bg-layer-transparent-hover text-primary" : "text-secondary"
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    <span className="min-w-0 flex-1 truncate">{timezone.replace(/_/g, " ")}</span>
                    {selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                  </>
                )}
              </Combobox.Option>
            ))}
            {filteredTimezones.length === 0 && (
              <div className="px-2 py-4 text-center text-12 text-tertiary">No matching timezones</div>
            )}
          </div>
        </Combobox.Options>
      </div>
    </Combobox>
  );
}

type GoogleAccountsMenuProps = {
  accounts: TCalendarAccount[];
  sources: TGoogleCalendarSource[];
  calendarPrefs: TCalendarPrefs;
  onUpdateCalendarPrefs: (source: TGoogleCalendarSource, patch: Partial<{ visible: boolean; color: string }>) => void;
  onDisconnect: (account: TCalendarAccount) => void;
  onAddCalendar: () => void;
  isConnecting: boolean;
};

function GoogleAccountsMenu({
  accounts,
  sources,
  calendarPrefs,
  onUpdateCalendarPrefs,
  onDisconnect,
  onAddCalendar,
  isConnecting,
}: GoogleAccountsMenuProps) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button
        aria-label="Manage calendars"
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-strong bg-layer-2 px-2 text-body-xs-medium whitespace-nowrap text-secondary shadow-raised-100 hover:bg-layer-2-hover"
      >
        <CalendarIcon className="size-3.5 text-tertiary" />
        <span className="df-calendar-menu-label">My calendars</span>
        <ChevronDown className="size-3.5 text-tertiary" />
      </Menu.Button>
      <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-72 rounded-lg border border-strong bg-surface-1 py-1 outline-none">
        {accounts.map((account) => {
          const accountSources = sources.filter((source) => source.account.id === account.id);
          return (
            <div key={account.id} className="border-b border-subtle px-1.5 py-1.5 last:border-b-0">
              <div className="flex items-center justify-between gap-2 px-2 py-1 text-11 text-tertiary">
                <span className="min-w-0 truncate">{calendarAccountLabel(account)}</span>
                <button
                  type="button"
                  onClick={() => onDisconnect(account)}
                  aria-label={`Disconnect ${calendarAccountLabel(account)}`}
                  title={`Disconnect ${calendarAccountLabel(account)}`}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-danger-primary"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {accountSources.length === 0 && <div className="px-2 py-2 text-12 text-tertiary">Loading calendars…</div>}
              {accountSources.map((source) => {
                const color = googleSourceColor(source, calendarPrefs);
                const visible = isGoogleSourceVisible(source, calendarPrefs);
                return (
                  <div
                    key={source.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-layer-2-hover"
                  >
                    <label
                      className="focus-within:ring-accent-primary relative size-3.5 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/5 focus-within:ring-2"
                      style={{ backgroundColor: color }}
                      title={`Change color for ${googleSourceLabel(source)}`}
                    >
                      <span className="sr-only">Change color for {googleSourceLabel(source)}</span>
                      <input
                        type="color"
                        value={color}
                        onChange={(event) => onUpdateCalendarPrefs(source, { color: event.target.value })}
                        aria-label={`Change color for ${googleSourceLabel(source)}`}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-13 text-primary">{googleSourceLabel(source)}</span>
                      {source.calendar.primary && <span className="text-11 text-tertiary">Primary</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateCalendarPrefs(source, { visible: !visible })}
                      aria-label={`${visible ? "Hide" : "Show"} ${googleSourceLabel(source)}`}
                      aria-pressed={visible}
                      title={`${visible ? "Hide" : "Show"} ${googleSourceLabel(source)}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-primary"
                    >
                      {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="border-t border-subtle p-1">
          <button
            type="button"
            onClick={onAddCalendar}
            disabled={isConnecting}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-12 text-secondary hover:bg-layer-2-hover disabled:opacity-50"
          >
            <CalendarIcon className="size-3.5" />
            {isConnecting ? "Redirecting…" : "Add calendar"}
          </button>
        </div>
      </Menu.Items>
    </Menu>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />;
}

type TDayListEvent = {
  id: string;
  title: string;
  start: Temporal.PlainDate | Temporal.ZonedDateTime;
  end: Temporal.PlainDate | Temporal.ZonedDateTime;
  calendarId: string;
  _dragonfruit?: TDragonfruitEventMeta;
};

const formatEventTime = (value: TDayListEvent["start"]) =>
  value.toLocaleString(undefined, { hour: "numeric", minute: "numeric" });

// Same time rendering as Schedule-X's month grid: the Temporal value's own
// wall-clock time, no timezone conversion. Shows the full start – end range.
function dayListEventTime(ev: TDayListEvent) {
  if (ev.start.toString().length === 10) return "All day";
  return `${formatEventTime(ev.start)} – ${formatEventTime(ev.end)}`;
}

function DayEventsModal(props: {
  date: string;
  events: TDayListEvent[];
  calendarsConfig: Record<string, { lightColors: { main: string } }>;
  onClose: () => void;
  onSelectEvent: (meta: TDragonfruitEventMeta | undefined) => void;
}) {
  const { date, events, calendarsConfig, onClose, onSelectEvent } = props;
  const heading = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <ModalCore isOpen handleClose={onClose} width={EModalWidth.MD}>
      <div className="border-b border-subtle px-5 py-4">
        <h2 className="text-16 font-semibold text-primary">{heading}</h2>
        <p className="mt-0.5 text-12 text-tertiary">
          {events.length} {events.length === 1 ? "event" : "events"}
        </p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
        {events.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => onSelectEvent(ev._dragonfruit)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-layer-2-hover"
          >
            <LegendDot color={calendarsConfig[ev.calendarId]?.lightColors.main ?? CALENDAR_ACCENT} />
            <span className="w-32 shrink-0 text-12 text-tertiary">{dayListEventTime(ev)}</span>
            <span className="min-w-0 flex-1 truncate text-13 text-primary">{ev.title}</span>
          </button>
        ))}
        {events.length === 0 && <div className="px-3 py-4 text-13 text-tertiary">No events on this day.</div>}
      </div>
    </ModalCore>
  );
}

// Floating preview shown while hovering a month cell's "+ N events" chip:
// the full day's events with start – end times, no click needed. Stays open
// while the pointer is over it (rows are clickable) via the enter/leave
// handlers; positioning is precomputed from the chip's rect.
function DayEventsHoverCard(props: {
  date: string;
  events: TDayListEvent[];
  calendarsConfig: Record<string, { lightColors: { main: string } }>;
  left: number;
  top: number;
  openUp: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSelectEvent: (meta: TDragonfruitEventMeta | undefined) => void;
}) {
  const { date, events, calendarsConfig, left, top, openUp, onMouseEnter, onMouseLeave, onSelectEvent } = props;
  const heading = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div
      className="df-calendar-pop shadow-lg fixed z-30 w-80 overflow-hidden rounded-lg border border-strong bg-layer-2"
      style={{ left, top, transform: openUp ? "translateY(-100%)" : undefined }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-baseline justify-between border-b border-subtle px-3 py-2">
        <span className="text-12 font-medium text-primary">{heading}</span>
        <span className="text-11 text-tertiary">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {events.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => onSelectEvent(ev._dragonfruit)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-layer-2-hover"
          >
            <LegendDot color={calendarsConfig[ev.calendarId]?.lightColors.main ?? CALENDAR_ACCENT} />
            <span className="shrink-0 text-11 whitespace-nowrap text-tertiary">{dayListEventTime(ev)}</span>
            <span className="min-w-0 flex-1 truncate text-12 text-primary">{ev.title}</span>
          </button>
        ))}
        {events.length === 0 && <div className="px-3 py-3 text-12 text-tertiary">No events on this day.</div>}
      </div>
    </div>
  );
}

const formatEventDay = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

// Human-readable "when" for a Google event, in the calendar's display timezone.
function formatEventWhen(event: TCalendarEventWithSource, timezone: string) {
  try {
    if (event.all_day || event.start?.length === 10) {
      const formatDay = formatEventDay;
      const start = new Date(`${event.start}T00:00:00`);
      // Google's all-day `end` is exclusive.
      const end = new Date(`${event.end?.length === 10 ? event.end : event.start}T00:00:00`);
      end.setDate(end.getDate() - 1);
      return end > start ? `${formatDay(start)} – ${formatDay(end)}` : formatDay(start);
    }
    const start = new Date(event.start);
    const end = new Date(event.end);
    const dateFormat = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    });
    const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", timeZone: timezone });
    if (dateFormat.format(start) === dateFormat.format(end)) {
      return `${dateFormat.format(start)} · ${timeFormat.format(start)} – ${timeFormat.format(end)}`;
    }
    return `${dateFormat.format(start)} ${timeFormat.format(start)} – ${dateFormat.format(end)} ${timeFormat.format(end)}`;
  } catch {
    return `${event.start ?? ""} – ${event.end ?? ""}`;
  }
}

const EVENT_FIELD_CLASS =
  "focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none";

function eventDateTimeFields(iso: string, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
  } catch {
    return { date: iso.slice(0, 10), time: "09:00" };
  }
}

// Details and in-place editor for a Google Calendar event.
function GoogleEventDetailsModal(props: {
  event: TCalendarEventWithSource;
  canEdit: boolean;
  color: string;
  timezone: string;
  onClose: () => void;
  onCreateTask: () => void;
  onUpdated: (event: TCalendarEvent) => void | Promise<void>;
}) {
  const { event, canEdit, color, timezone, onClose, onCreateTask, onUpdated } = props;
  const initialStart = event.all_day
    ? { date: event.start.slice(0, 10), time: "09:00" }
    : eventDateTimeFields(event.start, timezone);
  const initialEnd = event.all_day
    ? { date: googleAllDayInclusiveEnd(event.end), time: "10:00" }
    : eventDateTimeFields(event.end, timezone);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || "");
  const [location, setLocation] = useState(event.location || "");
  const [allDay, setAllDay] = useState(event.all_day);
  const [startDate, setStartDate] = useState(initialStart.date);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [isSaving, setIsSaving] = useState(false);
  const plainDescription = (event.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const resetEditor = () => {
    const start = event.all_day
      ? { date: event.start.slice(0, 10), time: "09:00" }
      : eventDateTimeFields(event.start, timezone);
    const end = event.all_day
      ? { date: googleAllDayInclusiveEnd(event.end), time: "10:00" }
      : eventDateTimeFields(event.end, timezone);
    setTitle(event.title);
    setDescription(event.description || "");
    setLocation(event.location || "");
    setAllDay(event.all_day);
    setStartDate(start.date);
    setEndDate(end.date);
    setStartTime(start.time);
    setEndTime(end.time);
  };

  const handleCancelEdit = () => {
    resetEditor();
    setIsEditing(false);
  };

  const handleSave = async () => {
    const name = title.trim();
    const effectiveEndDate = endDate || startDate;
    if (!name || !startDate || !effectiveEndDate || isSaving) return;
    const start = allDay ? startDate : `${startDate}T${startTime}:00`;
    const end = allDay ? effectiveEndDate : `${effectiveEndDate}T${endTime}:00`;
    if ((allDay && end < start) || (!allDay && end <= start)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Check the event time",
        message: "The event must end after it starts.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await calendarService.updateEvent(event.accountId, {
        event_id: event.id,
        calendar_id: event.calendarId,
        all_day: allDay,
        start,
        end,
        time_zone: allDay ? undefined : timezone,
        title: name,
        description,
        location,
      });
      await onUpdated(response.event);
      setIsEditing(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Event updated", message: `Changes to “${name}” were saved.` });
    } catch (err) {
      console.error("Could not update event", err);
      const message =
        (err as { response?: { data?: { details?: string; error?: string } } })?.response?.data?.details ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Try again in a moment.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't update event", message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <ModalCore isOpen handleClose={handleCancelEdit} width={EModalWidth.XXL}>
        <form
          className="flex flex-col"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void handleSave();
          }}
        >
          <div className="border-b border-subtle px-5 py-4">
            <div className="flex items-center gap-2 text-12 text-tertiary">
              <LegendDot color={color} />
              <span className="min-w-0 truncate">{event.calendarName}</span>
            </div>
            <h2 className="mt-1 text-16 font-semibold text-primary">Edit event</h2>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Title</span>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the primary field when edit mode opens
                autoFocus
                className={EVENT_FIELD_CLASS}
                value={title}
                onChange={(inputEvent) => setTitle(inputEvent.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-13 text-secondary">
              <input type="checkbox" checked={allDay} onChange={(inputEvent) => setAllDay(inputEvent.target.checked)} />
              All day
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-11 font-medium text-secondary">Starts</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    className={EVENT_FIELD_CLASS}
                    value={startDate}
                    onChange={(inputEvent) => setStartDate(inputEvent.target.value)}
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      className={EVENT_FIELD_CLASS}
                      value={startTime}
                      onChange={(inputEvent) => setStartTime(inputEvent.target.value)}
                    />
                  )}
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-11 font-medium text-secondary">Ends</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    min={startDate}
                    className={EVENT_FIELD_CLASS}
                    value={endDate}
                    onChange={(inputEvent) => setEndDate(inputEvent.target.value)}
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      className={EVENT_FIELD_CLASS}
                      value={endTime}
                      onChange={(inputEvent) => setEndTime(inputEvent.target.value)}
                    />
                  )}
                </div>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Location</span>
              <input
                className={EVENT_FIELD_CLASS}
                placeholder="Optional"
                value={location}
                onChange={(inputEvent) => setLocation(inputEvent.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Description</span>
              <textarea
                className="focus:border-accent-primary min-h-24 w-full resize-y rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none"
                placeholder="Optional"
                value={description}
                onChange={(inputEvent) => setDescription(inputEvent.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
            <Button variant="secondary" size="lg" type="button" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="submit"
              disabled={!title.trim() || !startDate || !endDate || isSaving}
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </ModalCore>
    );
  }

  return (
    <ModalCore isOpen handleClose={onClose} width={EModalWidth.MD}>
      <div className="border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2 text-12 text-tertiary">
          <LegendDot color={color} />
          <span className="min-w-0 truncate">
            {event.calendarName}
            {event.accountEmail ? ` · ${event.accountEmail}` : ""}
          </span>
        </div>
        <h2 className="mt-1 text-16 font-semibold text-primary">{event.title || "(no title)"}</h2>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div>
          <div className="text-11 font-medium text-tertiary">When</div>
          <div className="mt-0.5 text-13 text-primary">
            {formatEventWhen(event, timezone)}
            <span className="ml-1.5 text-12 text-tertiary">({timezoneOffsetLabel(timezone)})</span>
          </div>
        </div>
        {event.location && (
          <div>
            <div className="text-11 font-medium text-tertiary">Location</div>
            <div className="mt-0.5 text-13 break-words text-primary">{event.location}</div>
          </div>
        )}
        {event.hangout_link && (
          <div>
            <div className="text-11 font-medium text-tertiary">Meeting</div>
            <a
              className="mt-0.5 block text-13 break-all text-accent-primary hover:underline"
              href={event.hangout_link}
              target="_blank"
              rel="noreferrer"
            >
              {event.hangout_link}
            </a>
          </div>
        )}
        {plainDescription && (
          <div>
            <div className="text-11 font-medium text-tertiary">Description</div>
            <div className="mt-0.5 max-h-40 overflow-y-auto text-13 leading-5 whitespace-pre-wrap text-secondary">
              {plainDescription}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={onClose}>
          Close
        </Button>
        <Button variant="secondary" size="lg" onClick={onCreateTask}>
          Create task
        </Button>
        {canEdit && (
          <Button variant="secondary" size="lg" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        )}
        {event.html_link && (
          <Button
            variant={event.hangout_link ? "secondary" : "primary"}
            size="lg"
            onClick={() => window.open(event.html_link, "_blank", "noopener")}
          >
            Open in Google Calendar
          </Button>
        )}
        {event.hangout_link && (
          <Button variant="primary" size="lg" onClick={() => window.open(event.hangout_link, "_blank", "noopener")}>
            Join meeting
          </Button>
        )}
      </div>
    </ModalCore>
  );
}

function NewEventModal(props: {
  isOpen: boolean;
  sources: TGoogleCalendarSource[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { isOpen, sources, onClose, onCreated } = props;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().slice(0, 10);
    setTitle("");
    setDescription("");
    setAllDay(false);
    setStartDate(today);
    setEndDate(today);
    setStartTime("09:00");
    setEndTime("10:00");
    setSourceId((current) => (sources.some((source) => source.id === current) ? current : (sources[0]?.id ?? "")));
  }, [isOpen, sources]);

  const source = sources.find((item) => item.id === sourceId) ?? sources[0];

  const handleSubmit = async () => {
    const name = title.trim();
    if (!name || !source || isSaving) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const payload = allDay
      ? {
          calendar_id: source.calendar.id,
          title: name,
          description,
          all_day: true,
          start: startDate,
          end: endDate || startDate,
        }
      : {
          calendar_id: source.calendar.id,
          title: name,
          description,
          all_day: false,
          start: `${startDate}T${startTime}:00`,
          end: `${endDate || startDate}T${endTime}:00`,
          time_zone: timeZone,
        };
    setIsSaving(true);
    try {
      await calendarService.createEvent(source.account.id, payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Event created", message: `"${name}" added to your calendar.` });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Could not create event", err);
      const message =
        (err as { response?: { data?: { details?: string; error?: string } } })?.response?.data?.details ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Try again in a moment.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't create event", message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.XXL}>
      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="border-b border-subtle px-5 py-4">
          <h2 className="text-16 font-semibold text-primary">New event</h2>
          <p className="mt-0.5 text-12 text-tertiary">Added straight to your Google Calendar — separate from tasks.</p>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the first field when the create dialog opens
            autoFocus
            className={EVENT_FIELD_CLASS}
            placeholder="Event title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {sources.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Calendar</span>
              <select
                className={EVENT_FIELD_CLASS}
                value={source?.id ?? ""}
                onChange={(event) => setSourceId(event.target.value)}
              >
                {sources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {googleSourceLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-13 text-secondary">
            <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
            All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Starts</span>
              <div className="flex gap-2">
                <input
                  type="date"
                  className={EVENT_FIELD_CLASS}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
                {!allDay && (
                  <input
                    type="time"
                    className={EVENT_FIELD_CLASS}
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                )}
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-11 font-medium text-secondary">Ends</span>
              <div className="flex gap-2">
                <input
                  type="date"
                  className={EVENT_FIELD_CLASS}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
                {!allDay && (
                  <input
                    type="time"
                    className={EVENT_FIELD_CLASS}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                )}
              </div>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-11 font-medium text-secondary">Description</span>
            <textarea
              className="focus:border-accent-primary min-h-20 w-full resize-y rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none"
              placeholder="Optional"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" disabled={!title.trim() || !source || isSaving}>
            {isSaving ? "Creating…" : "Create event"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
