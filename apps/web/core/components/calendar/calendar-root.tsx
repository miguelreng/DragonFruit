/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "@/components/icons/lucide-shim";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, Header } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import {
  CalendarService,
  type TCalendarAccount,
  type TCalendarEvent,
  type TCalendarTask,
} from "@/services/calendar.service";

const calendarService = new CalendarService();
const TASKS_CALENDAR_ID = "tasks";
type TCalendarEventWithAccount = TCalendarEvent & { accountId: string; accountEmail: string };
type TCalendarPrefs = Record<string, { visible: boolean; color: string }>;
type TDragonfruitEventMeta =
  | { kind: "task"; projectId: string; taskId: string; workspaceSlug: string }
  | { kind: "google_event"; event: TCalendarEventWithAccount };

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

function googleCalendarId(accountId: string) {
  return `google-${accountId}`;
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

function googleAccountColor(account: TCalendarAccount, index: number, prefs: TCalendarPrefs) {
  return prefs[account.id]?.color || GOOGLE_COLORS[index % GOOGLE_COLORS.length] || "#2563eb";
}

function isGoogleAccountVisible(account: TCalendarAccount, prefs: TCalendarPrefs) {
  return prefs[account.id]?.visible ?? true;
}

function googleEventToScheduleXEvent(e: TCalendarEventWithAccount) {
  const start = toTemporal(e.start, e.all_day);
  const end = toTemporal(e.end, e.all_day);
  if (!start || !end) return null;
  return {
    id: `gcal-${e.accountId}-${e.id}`,
    title: e.title,
    start,
    end,
    calendarId: googleCalendarId(e.accountId),
    description: e.accountEmail ? `${e.accountEmail}${e.description ? `\n\n${e.description}` : ""}` : e.description,
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

  // Google: optional overlay.
  const { data: accounts, mutate: refetchAccounts } = useSWR<TCalendarAccount[]>("CALENDAR_ACCOUNTS", () =>
    calendarService.list()
  );
  const googleAccounts = useMemo(() => accounts ?? [], [accounts]);
  const [calendarPrefs, setCalendarPrefs] = useState<TCalendarPrefs>(() => loadCalendarPrefs());
  const visibleGoogleAccounts = useMemo(
    () => googleAccounts.filter((account) => isGoogleAccountVisible(account, calendarPrefs)),
    [googleAccounts, calendarPrefs]
  );
  const updateCalendarPrefs = useCallback(
    (account: TCalendarAccount, patch: Partial<{ visible: boolean; color: string }>, index: number) => {
      setCalendarPrefs((current) => {
        const next = {
          ...current,
          [account.id]: {
            visible: current[account.id]?.visible ?? true,
            color: current[account.id]?.color || GOOGLE_COLORS[index % GOOGLE_COLORS.length] || "#2563eb",
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
      visibleGoogleAccounts.map((account, index) => {
        const color = googleAccountColor(account, index, calendarPrefs);
        return [
          googleCalendarId(account.id),
          {
            colorName: googleCalendarId(account.id),
            lightColors: { main: color, container: `${color}1f`, onContainer: color },
            darkColors: { main: color, container: `${color}33`, onContainer: "#ffffff" },
          },
        ];
      })
    );
    return { ...BASE_CALENDARS_CONFIG, ...googleCalendars };
  }, [calendarPrefs, visibleGoogleAccounts]);

  const { data: googleEvents = [] } = useSWR<TCalendarEventWithAccount[]>(
    visibleGoogleAccounts.length > 0
      ? `CALENDAR_EVENTS_${visibleGoogleAccounts.map((account) => account.id).join("_")}`
      : null,
    async () => {
      const results = await Promise.all(
        visibleGoogleAccounts.map(async (account) => {
          const res = await calendarService.events(account.id, taskRange);
          return (res.events ?? []).map((event) =>
            Object.assign({}, event, {
              accountId: account.id,
              accountEmail: account.account_email,
            })
          );
        })
      );
      return results.flat();
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
        visibleGoogleAccounts.map((account, index) => [
          account.id,
          isGoogleAccountVisible(account, calendarPrefs),
          googleAccountColor(account, index, calendarPrefs),
        ])
      ),
    [calendarPrefs, visibleGoogleAccounts]
  );
  const [visibleMonth, setVisibleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;
  });

  // Keep the latest setQuickAddDate accessible from the (one-time) Schedule-X
  // callbacks closure — we don't want to recreate the calendar on every render.
  const openQuickAddRef = useRef<(date: string) => void>(() => {});
  openQuickAddRef.current = (date) => setQuickAddDate(date);
  // Same trick for the task peek handler — the closure inside createCalendar
  // captures the *first* render's setPeekIssue, so we route through a ref.
  const openTaskPeekRef = useRef<(payload: { projectId: string; taskId: string }) => void>(() => {});
  openTaskPeekRef.current = ({ projectId, taskId }) => setPeekIssue({ workspaceSlug, projectId, issueId: taskId });

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
            calendarPrefs={calendarPrefs}
            taskRange={taskRange}
            refetchAccounts={refetchAccounts}
            onUpdateCalendarPrefs={updateCalendarPrefs}
            onImportComplete={refetchTasks}
            onQuickAdd={() => setQuickAddDate(new Date().toISOString().slice(0, 10))}
            visibleMonth={visibleMonth}
            onToday={handleToday}
            onPrev={() => handleStep(-1)}
            onNext={() => handleStep(1)}
          />
        }
      />
      <div className="dragonfruit-calendar relative w-full flex-1 overflow-hidden">
        <ScheduleXCalendar key={calendarConfigKey} calendarApp={calendarApp} />
      </div>

      {/* Click-a-day → quick-create task. The existing CreateUpdateIssueModal
          handles project selection, validation, and submit; we just preload
          the date the user clicked into. */}
      <CreateUpdateIssueModal
        isOpen={quickAddDate !== null}
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
            : quickAddDate
              ? {
                  start_date: quickAddDate,
                  target_date: quickAddDate,
                }
              : undefined
        }
      />
      {/* Click-a-task → open the standard peek-overview drawer. The store
          is global, so a single mount is enough for the whole calendar. */}
      <IssuePeekOverview />
    </>
  );
}

type CalendarPageHeaderProps = {
  workspaceSlug: string;
  taskCount: number;
  googleAccounts: TCalendarAccount[];
  calendarPrefs: TCalendarPrefs;
  taskRange: { from: string; to: string };
  refetchAccounts: () => void;
  onUpdateCalendarPrefs: (
    account: TCalendarAccount,
    patch: Partial<{ visible: boolean; color: string }>,
    index: number
  ) => void;
  onImportComplete: () => void;
  onQuickAdd: () => void;
  visibleMonth: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function CalendarPageHeader({
  taskCount,
  googleAccounts,
  calendarPrefs,
  taskRange,
  refetchAccounts,
  workspaceSlug,
  onUpdateCalendarPrefs,
  onImportComplete,
  onQuickAdd,
  visibleMonth,
  onToday,
  onPrev,
  onNext,
}: CalendarPageHeaderProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [importingAccountId, setImportingAccountId] = useState<string | null>(null);
  const hasGoogleAccounts = googleAccounts.length > 0;
  const visibleGoogleAccounts = googleAccounts.filter((account) => isGoogleAccountVisible(account, calendarPrefs));

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

  const handleSyncTasks = async (account: TCalendarAccount) => {
    if (syncingAccountId) return;
    setSyncingAccountId(account.id);
    try {
      const res = await calendarService.syncTasksToGoogle(workspaceSlug, {
        account_id: account.id,
        from: taskRange.from,
        to: taskRange.to,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `Synced ${res.synced} tasks`,
        message:
          res.failed.length > 0 ? `${res.failed.length} failed` : `${calendarAccountLabel(account)} is up to date.`,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't sync tasks",
        message: "Try again in a moment.",
      });
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleImportGoogle = async (account: TCalendarAccount) => {
    if (importingAccountId) return;
    setImportingAccountId(account.id);
    try {
      const res = await calendarService.importGoogleEvents(workspaceSlug, {
        account_id: account.id,
        from: taskRange.from,
        to: taskRange.to,
      });
      onImportComplete();
      setToast({
        type: res.failed.length > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.SUCCESS,
        title: `Imported ${res.imported} Google events`,
        message:
          res.failed.length > 0
            ? `${res.failed.length} couldn't import, ${res.skipped} skipped.`
            : res.skipped > 0
              ? `${res.skipped} skipped`
              : "DragonFruit calendar is up to date.",
      });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data?.details ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Try again in a moment.";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't import Google events",
        message,
      });
    } finally {
      setImportingAccountId(null);
    }
  };

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="Calendar" icon={<CalendarIcon className="h-4 w-4 text-tertiary" />} />}
          />
        </Breadcrumbs>
        <div className="ml-2 flex items-center gap-2 text-13 text-secondary">
          <LegendDot color="#ec4899" />
          <span>
            Your tasks <span className="ml-0.5 text-tertiary">· {taskCount}</span>
          </span>
          {hasGoogleAccounts && (
            <>
              <span className="text-tertiary">·</span>
              <LegendDot
                color={googleAccounts[0] ? googleAccountColor(googleAccounts[0], 0, calendarPrefs) : "#2563eb"}
              />
              <span className="truncate">
                {googleAccounts.length === 1
                  ? calendarAccountLabel(googleAccounts[0]!)
                  : `${visibleGoogleAccounts.length}/${googleAccounts.length} Google calendars`}
              </span>
            </>
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
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-primary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-primary"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <span className="px-1 text-13 font-medium text-primary">{visibleMonth}</span>
        <span className="bg-subtle mx-1 h-5 w-px" aria-hidden />
        <Button variant="primary" size="lg" prependIcon={<Plus />} onClick={onQuickAdd}>
          New task
        </Button>
        <Button
          variant="secondary"
          size="lg"
          prependIcon={<CalendarIcon />}
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? "Redirecting…" : hasGoogleAccounts ? "Add Google Calendar" : "Connect Google Calendar"}
        </Button>
        {hasGoogleAccounts && (
          <GoogleAccountsMenu
            accounts={googleAccounts}
            syncingAccountId={syncingAccountId}
            importingAccountId={importingAccountId}
            calendarPrefs={calendarPrefs}
            onUpdateCalendarPrefs={onUpdateCalendarPrefs}
            onSync={handleSyncTasks}
            onImport={handleImportGoogle}
            onDisconnect={handleDisconnect}
          />
        )}
      </Header.RightItem>
    </Header>
  );
}

type GoogleAccountsMenuProps = {
  accounts: TCalendarAccount[];
  syncingAccountId: string | null;
  importingAccountId: string | null;
  calendarPrefs: TCalendarPrefs;
  onUpdateCalendarPrefs: (
    account: TCalendarAccount,
    patch: Partial<{ visible: boolean; color: string }>,
    index: number
  ) => void;
  onSync: (account: TCalendarAccount) => void;
  onImport: (account: TCalendarAccount) => void;
  onDisconnect: (account: TCalendarAccount) => void;
};

function GoogleAccountsMenu({
  accounts,
  syncingAccountId,
  importingAccountId,
  calendarPrefs,
  onUpdateCalendarPrefs,
  onSync,
  onImport,
  onDisconnect,
}: GoogleAccountsMenuProps) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-strong bg-layer-2 px-2 text-body-xs-medium text-secondary shadow-raised-100 hover:bg-layer-2-hover">
        Google calendars
        <ChevronDown className="size-3.5 text-tertiary" />
      </Menu.Button>
      <Menu.Items className="shadow-lg absolute right-0 z-30 mt-1 w-72 rounded-md border border-strong bg-layer-2 py-1 outline-none">
        {accounts.map((account, index) => {
          const color = googleAccountColor(account, index, calendarPrefs);
          const visible = isGoogleAccountVisible(account, calendarPrefs);
          return (
            <div key={account.id} className="border-b border-subtle px-2 py-2 last:border-b-0">
              <div className="mb-1 flex items-center gap-2 px-1 text-13 font-medium text-primary">
                <LegendDot color={color} />
                <span className="min-w-0 truncate">{calendarAccountLabel(account)}</span>
              </div>
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => onUpdateCalendarPrefs(account, { visible: !visible }, index)}
                  className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-12 text-secondary hover:bg-layer-2-hover"
                >
                  {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {visible ? "Shown" : "Hidden"}
                </button>
                <div className="flex items-center gap-1">
                  {GOOGLE_COLORS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-label={`Use calendar color ${option}`}
                      onClick={() => onUpdateCalendarPrefs(account, { color: option }, index)}
                      className="grid size-5 place-items-center rounded-full border border-subtle"
                      style={{ backgroundColor: option }}
                    >
                      {color === option && <Check className="size-3 text-on-color" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
              <Menu.Item>
                <button
                  type="button"
                  onClick={() => onImport(account)}
                  disabled={importingAccountId !== null}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-13 text-secondary hover:bg-layer-2-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{importingAccountId === account.id ? "Importing..." : "Import events"}</span>
                </button>
              </Menu.Item>
              <Menu.Item>
                <button
                  type="button"
                  onClick={() => onSync(account)}
                  disabled={syncingAccountId !== null}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-13 text-secondary hover:bg-layer-2-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{syncingAccountId === account.id ? "Syncing..." : "Sync tasks to this account"}</span>
                </button>
              </Menu.Item>
              <Menu.Item>
                <button
                  type="button"
                  onClick={() => onDisconnect(account)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-13 text-danger-primary hover:bg-layer-2-hover"
                >
                  <Trash2 className="size-3.5" />
                  Disconnect
                </button>
              </Menu.Item>
            </div>
          );
        })}
      </Menu.Items>
    </Menu>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />;
}
