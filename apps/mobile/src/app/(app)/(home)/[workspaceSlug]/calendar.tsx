import { useCallback, useMemo, useRef } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import {
  Calendar03Icon,
  CalendarCheckIn01Icon,
  Location01Icon,
  UserGroupIcon,
  Video01Icon,
} from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getUpcomingMeetings, type CalendarEvent } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 86_400_000;
/** Events without an explicit end are treated as lasting this long for "now" math. */
const DEFAULT_DURATION = 60 * 60 * 1000;

function clockTime(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}

/**
 * Parse a calendar event's date. Timed events arrive as full ISO datetimes
 * (with an offset) and parse fine; all-day events arrive as a bare "YYYY-MM-DD",
 * which `new Date()` reads as UTC midnight — landing on the *previous* day in
 * negative-UTC offsets and throwing off "Today"/day grouping. Parse the bare
 * date in local time so the day is correct everywhere.
 */
function parseEventDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** End-of-event timestamp, used to decide whether an event is happening now. */
function eventEnd(event: CalendarEvent): number {
  const start = parseEventDate(event.start).getTime();
  if (event.all_day) return startOfDay(parseEventDate(event.start)) + DAY;
  return event.end ? parseEventDate(event.end).getTime() : start + DEFAULT_DURATION;
}

type EventStatus = "now" | "next" | null;

type Section = {
  /** Relative heading: "Today", "Tomorrow", "Yesterday", or a weekday name. */
  label: string;
  /** Calendar date, e.g. "Jun 4". */
  date: string;
  data: CalendarEvent[];
};

function dayLabel(start: number, today: number): string {
  const diff = Math.round((start - today) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return WEEKDAYS[new Date(start).getDay()];
}

/** Group the pre-sorted event list into day sections for the agenda. */
function groupByDay(events: CalendarEvent[], today: number): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const event of events) {
    const start = parseEventDate(event.start);
    const key = startOfDay(start);
    if (!current || startOfDay(parseEventDate(current.data[0].start)) !== key) {
      current = {
        label: dayLabel(key, today),
        date: `${MONTHS[start.getMonth()]} ${start.getDate()}`,
        data: [],
      };
      sections.push(current);
    }
    current.data.push(event);
  }
  return sections;
}

export default function CalendarScreen() {
  const {
    data: events,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<CalendarEvent>(getUpcomingMeetings, []);

  const listRef = useRef<SectionList<CalendarEvent, Section>>(null);

  const now = Date.now();
  const todayStart = startOfDay(new Date(now));
  const sections = useMemo(() => groupByDay(events, todayStart), [events, todayStart]);

  // The first event that hasn't started yet is the user's "next" meeting.
  const nextId = useMemo(() => {
    const upcoming = events.find((e) => parseEventDate(e.start).getTime() > now);
    return upcoming?.id ?? null;
  }, [events, now]);

  // Index of today's section, or the soonest upcoming day when nothing is today.
  const todayIndex = useMemo(() => {
    const exact = sections.findIndex((s) => s.label === "Today");
    if (exact !== -1) return exact;
    return sections.findIndex((s) => startOfDay(parseEventDate(s.data[0].start)) >= todayStart);
  }, [sections, todayStart]);

  const scrollToToday = useCallback(() => {
    if (todayIndex < 0) return;
    listRef.current?.scrollToLocation({ sectionIndex: todayIndex, itemIndex: 0, viewPosition: 0, animated: true });
  }, [todayIndex]);

  function statusOf(event: CalendarEvent): EventStatus {
    const start = parseEventDate(event.start).getTime();
    if (start <= now && eventEnd(event) > now) return "now";
    if (event.id === nextId) return "next";
    return null;
  }

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="Calendar"
        right={
          sections.length > 0 && todayIndex >= 0 ? (
            <Pressable
              onPress={scrollToToday}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              {({ pressed }) => (
                <View style={[styles.todayBtn, pressed && styles.todayBtnPressed]}>
                  <AppIcon icon={CalendarCheckIn01Icon} size={15} color={colors.brandText} strokeWidth={1.9} />
                  <Text style={styles.todayText}>Today</Text>
                </View>
              )}
            </Pressable>
          ) : null
        }
      />

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <ScrollFade top={false} bottomHeight={64}>
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(e) => e.id}
          stickySectionHeadersEnabled
          onScrollToIndexFailed={() => {
            // Variable row heights can defeat an immediate measure; retry once the
            // target has been laid out.
            setTimeout(scrollToToday, 120);
          }}
          contentContainerStyle={[styles.listContent, sections.length === 0 && styles.listContentEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState message={error} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              <Text style={styles.sectionDate}>{section.date}</Text>
            </View>
          )}
          renderItem={({ item }) => <EventRow event={item} status={statusOf(item)} />}
          SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        />
        </ScrollFade>
      )}
    </View>
  );
}

function EventRow({ event, status }: { event: CalendarEvent; status: EventStatus }) {
  const start = parseEventDate(event.start);
  const end = event.end ? parseEventDate(event.end) : null;
  const isNow = status === "now";

  return (
    <View style={styles.row}>
      <View style={styles.timeCol}>
        {event.all_day ? (
          <Text style={styles.allDay}>All day</Text>
        ) : (
          <>
            <Text style={[styles.timeStart, isNow && styles.timeStartNow]}>{clockTime(start)}</Text>
            {end ? <Text style={styles.timeEnd}>{clockTime(end)}</Text> : null}
          </>
        )}
      </View>

      <View style={styles.rail}>
        <View style={styles.railLine} />
        <View style={[styles.dot, isNow && styles.dotNow]} />
      </View>

      <View style={[styles.card, isNow && styles.cardNow]}>
        {status ? (
          <View style={[styles.badge, isNow ? styles.badgeNow : styles.badgeNext]}>
            {isNow ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.badgeText, isNow ? styles.badgeTextNow : styles.badgeTextNext]}>
              {isNow ? "Now" : "Next"}
            </Text>
          </View>
        ) : null}

        <Text style={styles.title} numberOfLines={2}>
          {event.title || "Untitled event"}
        </Text>

        {event.location || event.attendee_count > 0 ? (
          <View style={styles.metaRow}>
            {event.location ? (
              <View style={styles.metaChip}>
                <AppIcon icon={Location01Icon} size={13} color={colors.muted} strokeWidth={1.9} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            ) : null}
            {event.attendee_count > 0 ? (
              <View style={styles.metaChip}>
                <AppIcon icon={UserGroupIcon} size={13} color={colors.muted} strokeWidth={1.9} />
                <Text style={styles.metaText}>
                  {event.attendee_count} guest{event.attendee_count === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {event.hangout_link ? (
          <Pressable
            onPress={() => openWeb(event.hangout_link)}
            accessibilityRole="button"
            accessibilityLabel="Join meeting"
          >
            {({ pressed }) => (
              <View style={[styles.joinBtn, isNow && styles.joinBtnNow, pressed && styles.joinBtnPressed]}>
                <AppIcon icon={Video01Icon} size={15} color={colors.white} strokeWidth={1.9} />
                <Text style={styles.joinText}>Join</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EmptyState({ message }: { message?: string | null }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <AppIcon icon={Calendar03Icon} size={28} color={colors.brand} strokeWidth={1.8} />
      </View>
      <Text style={styles.emptyTitle}>{message ? "Couldn't load calendar" : "No upcoming meetings"}</Text>
      <Text style={styles.emptyBody}>
        {message ?? "When you connect a calendar on the web app, your next meetings show up here."}
      </Text>
    </View>
  );
}

function CalendarSkeleton() {
  return (
    <View style={styles.listContent}>
      <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
        <View style={[styles.skel, { width: 70, height: 16 }]} />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          <View style={styles.timeCol}>
            <View style={[styles.skel, { width: 46, height: 13 }]} />
          </View>
          <View style={styles.rail}>
            <View style={styles.railLine} />
            <View style={styles.dot} />
          </View>
          <View style={[styles.card, styles.skelCard]}>
            <View style={[styles.skel, { width: "75%", height: 15 }]} />
            <View style={[styles.skel, { width: "45%", height: 12, marginTop: 10 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const TIME_COL = 58;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },

  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  todayBtnPressed: { opacity: 0.65 },
  todayText: { fontSize: font.size.sm, fontFamily: "Figtree_600SemiBold", color: colors.brandText },

  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  listContentEmpty: { flexGrow: 1 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvas,
  },
  sectionLabel: { fontSize: font.size.md, fontFamily: "Figtree_600SemiBold", color: colors.ink },
  sectionDate: { fontSize: font.size.xs, fontFamily: "Figtree_500Medium", color: colors.faint },
  sectionGap: { height: spacing.xs },

  row: { flexDirection: "row", marginBottom: spacing.sm },

  timeCol: { width: TIME_COL, paddingTop: 2, alignItems: "flex-end" },
  timeStart: { fontSize: font.size.sm, fontFamily: "Figtree_600SemiBold", color: colors.body, textAlign: "right" },
  timeStartNow: { color: colors.brand },
  timeEnd: { marginTop: 2, fontSize: font.size.xs, fontFamily: "Figtree_400Regular", color: colors.faint, textAlign: "right" },
  allDay: { fontSize: font.size.xs, fontFamily: "Figtree_600SemiBold", color: colors.muted, textAlign: "right" },

  // Timeline rail: a continuous hairline with a node dot aligned to the start time.
  rail: { width: 28, alignItems: "center" },
  railLine: { position: "absolute", top: 0, bottom: -spacing.sm, width: 2, backgroundColor: colors.border },
  dot: {
    marginTop: 4,
    width: 11,
    height: 11,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvas,
  },
  dotNow: { borderColor: colors.brand, backgroundColor: colors.brand },

  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.card,
  },
  cardNow: { borderColor: colors.brand, backgroundColor: colors.accentSubtle },

  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeNow: { backgroundColor: colors.brand },
  badgeNext: { backgroundColor: colors.layer1Active },
  liveDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.white },
  badgeText: { fontSize: font.size.xs, fontFamily: "Figtree_600SemiBold", letterSpacing: 0.3 },
  badgeTextNow: { color: colors.white },
  badgeTextNext: { color: colors.muted },

  title: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  metaRow: { marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  metaText: { fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular", flexShrink: 1 },

  joinBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  joinBtnNow: { ...shadow.button },
  joinBtnPressed: { backgroundColor: colors.accentPrimaryHover },
  joinText: { fontSize: font.size.sm, color: colors.white, fontFamily: "Figtree_600SemiBold" },

  // Empty state
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xs },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.size.md, fontFamily: "Figtree_600SemiBold", color: colors.ink },
  emptyBody: {
    textAlign: "center",
    fontSize: font.size.sm,
    lineHeight: 20,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },

  // Skeleton
  skel: { borderRadius: radius.sm, backgroundColor: colors.layer1Active },
  skelCard: { minHeight: 76 },
});
