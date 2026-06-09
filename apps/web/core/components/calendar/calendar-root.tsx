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
import { createCalendar, createViewMonthGrid } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
// reason: side-effect CSS import
// eslint-disable-next-line import/no-unassigned-import
import "@schedule-x/theme-default/dist/index.css";

import { Menu } from "@headlessui/react";
import {
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
} from "@/components/icons/lucide-shim";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
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

const calendarService = new CalendarService();
const TASKS_CALENDAR_ID = "tasks";
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
  | { kind: "task"; projectId: string; taskId: string; workspaceSlug: string }
  | { kind: "google_event"; event: TCalendarEventWithSource };

const GOOGLE_COLORS = ["#2563eb", "#0f9f6e", "#f97316", "#7c3aed", "#0891b2", "#be123c"];
const CALENDAR_PREFS_KEY = "dragonfruit.calendar.googlePrefs";

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
  const end = toTemporal(e.end, e.all_day);
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

const BASE_CALENDARS_CONFIG = {
  [TASKS_CALENDAR_ID]: {
    colorName: "tasks",
    lightColors: { main: "#ec4899", container: "#fce7f3", onContainer: "#831843" },
    darkColors: { main: "#f9a8d4", container: "#831843", onContainer: "#fce7f3" },
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
  const { data: googleSources = [] } = useSWR<TGoogleCalendarSource[]>(
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
            darkColors: { main: color, container: `${color}33`, onContainer: "#ffffff" },
          },
        ];
      })
    );
    return { ...BASE_CALENDARS_CONFIG, ...googleCalendars };
  }, [calendarPrefs, visibleGoogleSources]);

  const {
    data: googleEvents = [],
    error: googleEventsError,
    isLoading: isLoadingGoogleEvents,
    mutate: refetchGoogleEvents,
  } = useSWR<TCalendarEventWithSource[]>(
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

  const sxEvents = useMemo(() => {
    const taskEvents = (tasksRes?.tasks ?? [])
      .map((t) => taskToScheduleXEvent(t, workspaceSlug))
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const gEvents = googleEvents.map(googleEventToScheduleXEvent).filter((e): e is NonNullable<typeof e> => e !== null);
    return [...taskEvents, ...gEvents];
  }, [tasksRes, googleEvents, workspaceSlug]);

  const eventsService = useRef(createEventsServicePlugin()).current;
  const calendarControls = useRef(createCalendarControlsPlugin()).current;
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

  // Keep the latest setQuickAddDate accessible from the (one-time) Schedule-X
  // callbacks closure — we don't want to recreate the calendar on every render.
  const openQuickAddRef = useRef<(date: string) => void>(() => {});
  openQuickAddRef.current = (date) => setQuickAddDate(date);
  // Same trick for the task peek handler — the closure inside createCalendar
  // captures the *first* render's setPeekIssue, so we route through a ref.
  const openTaskPeekRef = useRef<(payload: { projectId: string; taskId: string }) => void>(() => {});
  openTaskPeekRef.current = ({ projectId, taskId }) => {
    setHasOpenedIssuePeek(true);
    setPeekIssue({ workspaceSlug, projectId, issueId: taskId });
  };

  const calendarApp = useMemo(
    () =>
      createCalendar({
        views: [createViewMonthGrid()],
        defaultView: createViewMonthGrid().name,
        events: [],
        calendars: calendarsConfig,
        plugins: [eventsService, calendarControls],
        callbacks: {
          onClickDate: (date) => openQuickAddRef.current(typeof date === "string" ? date.slice(0, 10) : ""),
          onClickDateTime: (dateTime) =>
            openQuickAddRef.current(typeof dateTime === "string" ? dateTime.slice(0, 10) : ""),
          onEventClick: (event) => {
            const meta = (event as unknown as { _dragonfruit?: TDragonfruitEventMeta })._dragonfruit;
            if (meta?.kind === "task") {
              openTaskPeekRef.current({ projectId: meta.projectId, taskId: meta.taskId });
              return;
            }
            if (meta?.kind === "google_event") {
              const e = meta.event;
              const start = e.start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
              const end = e.end?.slice(0, 10) ?? start;
              setQuickAddSeed({
                name: e.title,
                description_html: e.description || "",
                start_date: start,
                target_date: end,
              });
              setQuickAddDate(start);
            }
          },
          onRangeUpdate: () => {
            // Fires when navigation moves to a different month. Use it to keep
            // our custom toolbar label in sync with Schedule-X.
            try {
              const cur = calendarControls.getDate();
              const d = new Date(cur.toString());
              setVisibleMonth(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`);
            } catch {
              // ignore — plugin not ready
            }
          },
        },
      }),
    [calendarControls, calendarsConfig, eventsService]
  );

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
    d.setMonth(d.getMonth() + delta);
    handleSetDate(d);
  };
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
    // Re-apply events after calendar visibility/color changes recreate the app.
    void calendarConfigKey;
    eventsService.set(sxEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConfigKey, sxEvents]);

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
            googleEventCount={googleEvents.length}
            isLoadingGoogleEvents={isLoadingGoogleEvents}
            hasGoogleEventsError={Boolean(googleEventsError)}
            onToday={handleToday}
            onPrev={() => handleStep(-1)}
            onNext={() => handleStep(1)}
            onRefresh={handleRefreshCalendar}
            isRefreshing={isRefreshingCalendar}
          />
        }
      />
      <div className="dragonfruit-calendar relative w-full flex-1 overflow-hidden">
        <ScheduleXCalendar key={calendarConfigKey} calendarApp={calendarApp} />
      </div>

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
  googleEventCount: number;
  isLoadingGoogleEvents: boolean;
  hasGoogleEventsError: boolean;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRefresh: () => void | Promise<void>;
  isRefreshing: boolean;
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
  googleEventCount,
  isLoadingGoogleEvents,
  hasGoogleEventsError,
  onToday,
  onPrev,
  onNext,
  onRefresh,
  isRefreshing,
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
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="Calendar" icon={<CalendarIcon className="h-4 w-4 text-tertiary" />} />}
          />
        </Breadcrumbs>
        <div className="ml-2 flex items-center gap-3 text-12 text-tertiary">
          <span className="flex items-center gap-1.5">
            <LegendDot color="#ec4899" />
            {taskCount} tasks
          </span>
          {hasGoogleAccounts && (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <LegendDot color={googleSources[0] ? googleSourceColor(googleSources[0], calendarPrefs) : "#2563eb"} />
              {isLoadingGoogleEvents
                ? "Loading…"
                : hasGoogleEventsError
                  ? "Events need attention"
                  : `${googleEventCount} events`}
            </span>
          )}
        </div>
      </Header.LeftItem>
      <Header.RightItem className="items-center">
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
        <span className="px-1 text-13 font-medium text-primary">{visibleMonth}</span>
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
        {canCreateEvent ? (
          <Menu as="div" className="relative">
            <Menu.Button className="t-press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-accent-primary px-3 text-body-xs-medium whitespace-nowrap text-on-color hover:opacity-90">
              New
              <ChevronDown className="size-3.5" />
            </Menu.Button>
            <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-44 rounded-lg border border-strong bg-layer-2 py-1 outline-none">
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
        ) : (
          <Button variant="primary" size="lg" onClick={onQuickAdd}>
            New task
          </Button>
        )}
      </Header.RightItem>
    </Header>
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
      <Menu.Button className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-strong bg-layer-2 px-2 text-body-xs-medium whitespace-nowrap text-secondary shadow-raised-100 hover:bg-layer-2-hover">
        My calendars
        <ChevronDown className="size-3.5 text-tertiary" />
      </Menu.Button>
      <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-64 rounded-lg border border-strong bg-layer-2 py-1 outline-none">
        {accounts.map((account) => {
          const accountSources = sources.filter((source) => source.account.id === account.id);
          return (
            <div key={account.id} className="border-b border-subtle px-2 py-2 last:border-b-0">
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-13 font-medium text-primary">
                <span className="min-w-0 truncate">{calendarAccountLabel(account)}</span>
                <button
                  type="button"
                  onClick={() => onDisconnect(account)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-12 text-danger-primary hover:bg-layer-2-hover"
                >
                  <Trash2 className="size-3.5" />
                  Disconnect
                </button>
              </div>
              {accountSources.length === 0 && (
                <div className="px-1 py-2 text-12 text-tertiary">Loading calendars...</div>
              )}
              {accountSources.map((source) => {
                const color = googleSourceColor(source, calendarPrefs);
                const visible = isGoogleSourceVisible(source, calendarPrefs);
                return (
                  <div key={source.id} className="rounded-lg px-1 py-1.5 hover:bg-layer-2-hover">
                    <div className="flex items-center gap-2">
                      <LegendDot color={color} />
                      <span className="min-w-0 flex-1 truncate text-13 text-primary">{googleSourceLabel(source)}</span>
                      {source.calendar.primary && <span className="text-11 text-tertiary">Primary</span>}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-11 text-tertiary">{visible ? "Shown" : "Hidden"}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateCalendarPrefs(source, { visible: !visible })}
                        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-12 text-secondary hover:bg-layer-2-hover"
                      >
                        {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </button>
                    </div>
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
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-13 text-secondary hover:bg-layer-2-hover disabled:opacity-50"
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

const EVENT_FIELD_CLASS =
  "focus:border-accent-primary h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none";

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
