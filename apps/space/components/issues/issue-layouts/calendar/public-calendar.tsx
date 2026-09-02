/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "@plane/propel/icon-button";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { Temporal } from "temporal-polyfill";

if (typeof globalThis !== "undefined") {
  // Schedule-X compares events against its global Temporal constructors.
  // Always share its peer polyfill so native or alternate Temporal instances pass instanceof checks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Temporal = Temporal;
}

import { createCalendar, createViewDay, createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import { createCurrentTimePlugin } from "@schedule-x/current-time";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar } from "@schedule-x/react";
import { createScrollControllerPlugin } from "@schedule-x/scroll-controller";
// reason: side-effect CSS imports
// eslint-disable-next-line import/no-unassigned-import
import "@schedule-x/theme-default/dist/index.css";
// eslint-disable-next-line import/no-unassigned-import
import "@/styles/public-calendar.css";

import { Eye, EyeClosed as EyeOff } from "@solar-icons/react/ssr";
import { Icon } from "@plane/propel/icons";
// components
import { IssueLayoutHOC } from "@/components/issues/issue-layouts/issue-layout-HOC";
// hooks
import { useIssue } from "@/hooks/store/use-issue";
import { useIssueDetails } from "@/hooks/store/use-issue-details";
// local imports
import {
  formatPublicCalendarToolbarLabel,
  getIssueDateRange,
  getMostPopulatedIssueMonth,
} from "./public-calendar.utils";

type TCalendarView = "month-grid" | "week" | "day";
type TPublicCalendarEventMeta = { issueId: string };

const CALENDAR_ACCENT = "#ec4899";
const TASKS_CALENDAR_ID = "tasks";
const OPEN_DAY_EVENT = "dragonfruit:public-calendar-open-day";
const CALENDAR_VIEW_OPTIONS: { value: TCalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month-grid", label: "Month" },
];
const CALENDARS_CONFIG = {
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

const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function WeekGridDateHeader({ date }: { date: string }) {
  const day = new Date(`${date}T00:00:00`);
  const isCurrentDay = date === toLocalDateString(new Date());

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_DAY_EVENT, { detail: date }))}
      title="Open day view"
      className="group/date flex w-full items-center justify-center gap-1.5 py-1.5"
    >
      <span className="text-11 font-medium text-tertiary">{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <span
        className={`df-week-date-pill grid size-6 place-items-center text-12 ${
          isCurrentDay ? "text-white" : "text-primary group-hover/date:bg-layer-2-hover"
        }`}
        style={isCurrentDay ? { backgroundColor: CALENDAR_ACCENT } : undefined}
      >
        {day.getDate()}
      </span>
    </button>
  );
}

const CALENDAR_CUSTOM_COMPONENTS = { weekGridDate: WeekGridDateHeader };

function timezoneOffsetLabel(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function CalendarTimezoneBadge({ timezone }: { timezone: string }) {
  return (
    <div className="pointer-events-none absolute top-2 left-0 z-10 flex w-14 flex-col items-center gap-0.5 text-center leading-tight">
      <span className="text-11 font-semibold text-secondary">{timezoneOffsetLabel(timezone)}</span>
      <span className="text-[10px] text-tertiary">{timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone}</span>
    </div>
  );
}

export const PublicCalendarLayout = observer(function PublicCalendarLayout() {
  const navigate = useNavigate();
  const { getGroupIssueCount, getIssueLoader } = useIssue();
  const { details } = useIssueDetails();
  const issues = Object.values(details);

  const [isClient, setIsClient] = useState(false);
  const [calendarTimezone, setCalendarTimezone] = useState("UTC");
  const [activeView, setActiveView] = useState<TCalendarView>("month-grid");
  const activeViewRef = useRef<TCalendarView>("month-grid");
  activeViewRef.current = activeView;
  const [showTasks, setShowTasks] = useState(true);
  const [toolbarLabel, setToolbarLabel] = useState(() =>
    formatPublicCalendarToolbarLabel("month-grid", new Date(), null, null)
  );

  const eventsService = useRef(createEventsServicePlugin()).current;
  const calendarControls = useRef(createCalendarControlsPlugin()).current;
  const currentTimePlugin = useRef(createCurrentTimePlugin({ fullWeekWidth: true })).current;
  const scrollController = useRef(createScrollControllerPlugin({ initialScroll: "07:00" })).current;
  const didSelectPopulatedMonth = useRef(false);
  const openIssueRef = useRef<(issueId: string) => void>(() => {});
  const syncToolbarLabelRef = useRef<() => void>(() => {});

  useEffect(() => {
    setCalendarTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setIsClient(true);
  }, []);

  openIssueRef.current = (issueId) => {
    const params = new URLSearchParams(window.location.search);
    params.set("board", "calendar");
    params.set("peekId", issueId);
    navigate({ search: params.toString() });
  };

  syncToolbarLabelRef.current = () => {
    try {
      const view = calendarControls.getView() as TCalendarView;
      setActiveView((current) => (current === view ? current : view));
      const date = new Date(`${calendarControls.getDate().toString().slice(0, 10)}T00:00:00`);
      let rangeStart: string | null = null;
      let rangeEnd: string | null = null;
      try {
        const range = calendarControls.getRange();
        rangeStart = range?.start.toString().slice(0, 10) ?? null;
        rangeEnd = range?.end.toString().slice(0, 10) ?? null;
      } catch {
        // The range is unavailable during the calendar's first layout pass.
      }
      setToolbarLabel(formatPublicCalendarToolbarLabel(view, date, rangeStart, rangeEnd));
    } catch {
      // Calendar controls are unavailable until Schedule-X mounts.
    }
  };

  const calendarApp = useMemo(
    () =>
      createCalendar({
        views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
        defaultView: activeViewRef.current,
        isResponsive: false,
        weekOptions: { eventOverlap: false },
        timezone: calendarTimezone,
        events: [],
        calendars: CALENDARS_CONFIG,
        plugins: [eventsService, calendarControls, currentTimePlugin, scrollController],
        callbacks: {
          onEventClick: (event) => {
            const metadata = (event as unknown as { _dragonfruit?: TPublicCalendarEventMeta })._dragonfruit;
            if (metadata?.issueId) openIssueRef.current(metadata.issueId);
          },
          onRangeUpdate: () => syncToolbarLabelRef.current(),
        },
      }),
    [calendarControls, calendarTimezone, currentTimePlugin, eventsService, scrollController]
  );

  const calendarEvents = useMemo(
    () =>
      showTasks
        ? issues.flatMap((issue) => {
            const range = getIssueDateRange(issue);
            if (!range) return [];
            return [
              {
                id: `task-${issue.id}`,
                title: issue.name,
                start: Temporal.PlainDate.from(range.start),
                end: Temporal.PlainDate.from(range.end),
                calendarId: TASKS_CALENDAR_ID,
                _dragonfruit: { issueId: issue.id },
              },
            ];
          })
        : [],
    [issues, showTasks]
  );

  useEffect(() => {
    if (!isClient) return;
    eventsService.set(calendarEvents);
  }, [calendarEvents, calendarTimezone, eventsService, isClient]);

  useEffect(() => {
    if (!isClient || didSelectPopulatedMonth.current || calendarEvents.length === 0) return;
    const mostPopulatedMonth = getMostPopulatedIssueMonth(issues);
    if (!mostPopulatedMonth) return;

    calendarControls.setDate(Temporal.PlainDate.from(`${mostPopulatedMonth}-01`));
    didSelectPopulatedMonth.current = true;
    syncToolbarLabelRef.current();
  }, [calendarControls, calendarEvents.length, isClient, issues]);

  useEffect(() => {
    const handleOpenDay = (event: Event) => {
      const date = (event as CustomEvent<string>).detail;
      if (!date) return;
      calendarControls.setView("day");
      calendarControls.setDate(Temporal.PlainDate.from(date));
      calendarControls.setView("day");
      setActiveView("day");
      syncToolbarLabelRef.current();
    };
    window.addEventListener(OPEN_DAY_EVENT, handleOpenDay);
    return () => window.removeEventListener(OPEN_DAY_EVENT, handleOpenDay);
  }, [calendarControls]);

  const setCalendarDate = useCallback(
    (date: Date) => {
      calendarControls.setDate(Temporal.PlainDate.from(toLocalDateString(date)));
      calendarControls.setView(calendarControls.getView());
      syncToolbarLabelRef.current();
    },
    [calendarControls]
  );

  const handleStep = (delta: -1 | 1) => {
    const date = new Date(`${calendarControls.getDate().toString().slice(0, 10)}T00:00:00`);
    if (activeView === "week") date.setDate(date.getDate() + delta * 7);
    else if (activeView === "day") date.setDate(date.getDate() + delta);
    else date.setMonth(date.getMonth() + delta);
    setCalendarDate(date);
  };

  const handleChangeView = (view: TCalendarView) => {
    if (view === activeView) return;
    calendarControls.setView(view);
    setActiveView(view);
    syncToolbarLabelRef.current();
  };

  return (
    <IssueLayoutHOC getGroupIssueCount={getGroupIssueCount} getIssueLoader={getIssueLoader}>
      <div className="flex size-full min-w-0 flex-col overflow-hidden bg-surface-1">
        <div className="dragonfruit-calendar-toolbar flex min-h-12 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-subtle-1 px-4 py-2">
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-13 font-medium text-primary">Calendar</span>
            <button
              type="button"
              onClick={() => setShowTasks((current) => !current)}
              aria-label={showTasks ? "Hide tasks on the calendar" : "Show tasks on the calendar"}
              aria-pressed={showTasks}
              className={`flex h-7 items-center gap-1.5 rounded-md px-1.5 text-12 text-tertiary transition-colors hover:bg-layer-2-hover ${
                showTasks ? "" : "opacity-60"
              }`}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: showTasks ? CALENDAR_ACCENT : "var(--text-color-tertiary)" }}
              />
              <span className={showTasks ? "" : "line-through"}>
                {issues.length} {issues.length === 1 ? "task" : "tasks"}
              </span>
              {showTasks ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex h-7 items-center gap-0.5 rounded-lg border border-strong bg-layer-1 p-0.5">
              {CALENDAR_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChangeView(option.value)}
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
            <button
              type="button"
              className="h-7 rounded-lg border border-strong bg-surface-1 px-2.5 text-12 font-medium text-primary hover:bg-layer-2-hover"
              onClick={() => setCalendarDate(new Date())}
            >
              Today
            </button>
            <div className="flex items-center">
              <IconButton
                variant="ghost"
                size="lg"
                icon={(props) => <Icon name="arrow.chevron-left" {...props} />}
                aria-label="Previous"
                onClick={() => handleStep(-1)}
              />
              <IconButton
                variant="ghost"
                size="lg"
                icon={(props) => <Icon name="arrow.chevron-right" {...props} />}
                aria-label="Next"
                onClick={() => handleStep(1)}
              />
            </div>
            <span className="inline-block w-44 truncate px-1 text-center text-13 font-medium text-primary">
              {toolbarLabel}
            </span>
            <span
              className="rounded-lg border border-strong bg-surface-1 px-2.5 py-1 text-11 text-tertiary"
              title={calendarTimezone}
            >
              {timezoneOffsetLabel(calendarTimezone)}
            </span>
          </div>
        </div>

        <div className="dragonfruit-calendar relative min-h-0 w-full flex-1 overflow-hidden">
          {isClient && (
            <ScheduleXCalendar
              key={calendarTimezone}
              calendarApp={calendarApp}
              customComponents={CALENDAR_CUSTOM_COMPONENTS}
            />
          )}
          {activeView !== "month-grid" && <CalendarTimezoneBadge timezone={calendarTimezone} />}
        </div>
      </div>
    </IssueLayoutHOC>
  );
});
