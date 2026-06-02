import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ActivityIndicator, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DrawerActions } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Add01Icon, ArrowRight01Icon, Calendar01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react-native";

import { AppIcon } from "@/components/app-icon";
import { BrandLogo } from "@/components/brand-logo";
import { AtlasPeek } from "@/components/atlas-peek";
import {
  getActivitySummary,
  getMyIssues,
  getProjects,
  getUpcomingMeetings,
  isAuthError,
  type CalendarEvent,
  type IssueListItem,
  type Project,
} from "@/lib/api";
import { PRIORITY_COLOR } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Calendar grid is Monday-first to match the reference layout.
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// The home backdrop tracks the time of day, matching the greeting buckets
// above — three Goya "Black Paintings", sorted by the light in them:
// morning → "Fight with Cudgels", afternoon → "A Pilgrimage to San Isidro",
// evening → "Saturn Devouring His Son".
const HOME_BACKDROPS = {
  day: require("../../../../../assets/images/home-mb-day.jpg"),
  noon: require("../../../../../assets/images/home-mb-noon.jpg"),
  night: require("../../../../../assets/images/home-mb.jpg"),
};

function homeBackdrop(date: Date) {
  const h = date.getHours();
  if (h < 12) return HOME_BACKDROPS.day;
  if (h < 18) return HOME_BACKDROPS.noon;
  return HOME_BACKDROPS.night;
}

/** Compact "when" for a meeting: "Today · 2:30 PM" / "Tue · 9:00 AM". */
function meetingWhen(event: CalendarEvent): string {
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toDateString() === new Date().toDateString() ? "Today" : DAY_ABBR[d.getDay()];
  if (event.all_day) return `${day} · All day`;
  let h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${day} · ${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}

type DayCell = { count: number; isToday: boolean; isFuture: boolean } | null;

const pad2 = (n: number) => n.toString().padStart(2, "0");

/**
 * Build the current month as a Monday-first grid of weeks, with each day's
 * real activity count attached. Today is flagged for a marker ring; days after
 * today are flagged as future (rendered faint). `maxCount` drives the
 * intensity ramp so the busiest day in the month is fully saturated.
 */
function useMonthGrid(now: Date, activity: Record<string, number>): { rows: DayCell[][]; todayColumn: number; maxCount: number } {
  return useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDate = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // getDay() is Sun=0..Sat=6; shift so Monday=0.
    const leadOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const todayColumn = (now.getDay() + 6) % 7;

    const cells: DayCell[] = Array.from({ length: leadOffset }, () => null);
    let maxCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const count = activity[`${year}-${pad2(month + 1)}-${pad2(day)}`] ?? 0;
      if (count > maxCount) maxCount = count;
      cells.push({ count, isToday: day === todayDate, isFuture: day > todayDate });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return { rows, todayColumn, maxCount };
  }, [now, activity]);
}

/** Pick the dot style stack for a day based on its activity intensity. */
function dotStyles(cell: NonNullable<DayCell>, maxCount: number) {
  const stack: ViewStyle[] = [styles.dot];
  if (cell.isFuture) {
    stack.push(styles.dotFuture);
  } else if (cell.count === 0) {
    stack.push(styles.dotEmpty);
  } else {
    const ratio = maxCount > 0 ? cell.count / maxCount : 0;
    stack.push(ratio > 0.66 ? styles.dotL3 : ratio > 0.33 ? styles.dotL2 : styles.dotL1);
  }
  if (cell.isToday) stack.push(styles.dotToday);
  return stack;
}

function SectionHeader({
  label,
  action,
  flush,
}: {
  label: string;
  action?: { icon: IconSvgElement; label: string; onPress: () => void };
  flush?: boolean;
}) {
  return (
    <View style={[styles.sectionHeader, flush && styles.sectionHeaderFlush]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          style={styles.sectionActionBtn}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <AppIcon icon={action.icon} size={18} color="rgba(255, 255, 255, 0.55)" strokeWidth={1.7} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function WorkspaceHomeScreen() {
  const navigation = useNavigation();
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { user, signOut } = useSession();

  const [issues, setIssues] = useState<IssueListItem[]>([]);
  // project_id -> identifier, so "On my plate" can render "PROJ-123" across projects.
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});
  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);
  // date (YYYY-MM-DD) -> weighted activity score, drives the heatmap dots.
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      // Meetings and activity are optional (no calendar / empty workspace → []),
      // so a failure in either must not blank out the rest of the home screen.
      const [projectList, myIssues, upcoming, summary] = await Promise.all([
        getProjects(workspaceSlug),
        getMyIssues(workspaceSlug, user.id),
        getUpcomingMeetings().catch(() => [] as CalendarEvent[]),
        getActivitySummary(workspaceSlug).catch(() => null),
      ]);
      setIssues(myIssues);
      setMeetings(upcoming);
      setIdentifiers(Object.fromEntries(projectList.map((project: Project) => [project.id, project.identifier])));
      // Dots grade on the weighted `score` (docs weigh heavier than work
      // items) so the shade reflects the kind of action, not a flat count.
      setActivity(
        summary ? Object.fromEntries(summary.daily_buckets.map((b) => [b.date, b.score])) : {}
      );
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load your home. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceSlug, user, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const today = new Date();
  const { rows, todayColumn, maxCount } = useMonthGrid(today, activity);
  const firstName = user?.first_name || user?.display_name || "there";
  const topIssues = issues.slice(0, 4);
  const topMeetings = meetings.slice(0, 3);

  // This screen's navigator is the stack; the drawer is its parent. Target the
  // drawer directly (falling back to a bubble-up dispatch) so the tap reliably
  // opens the sidebar — dispatching only on the stack can get swallowed.
  const openMenu = () => (navigation.getParent() ?? navigation).dispatch(DrawerActions.openDrawer());
  const openNewTask = () => router.push({ pathname: "/[workspaceSlug]/new-task", params: { workspaceSlug } });
  const openIssue = (issue: IssueListItem) =>
    router.push({
      pathname: "/[workspaceSlug]/issue/[issueId]",
      params: { workspaceSlug, issueId: issue.id, projectId: issue.project_id, name: issue.name },
    });
  const openCalendar = () => router.replace({ pathname: "/[workspaceSlug]/calendar", params: { workspaceSlug } });
  const openMyTasks = () => router.replace({ pathname: "/[workspaceSlug]/my-tasks", params: { workspaceSlug } });

  return (
    // Swipe in from the right edge to peek Ask Atlas across — the mirror of the
    // left-edge sidebar drawer, tracking the finger as it slides over home.
    <AtlasPeek>
    <ImageBackground
      source={homeBackdrop(today)}
      style={styles.bg}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      {/* Glass fading to clear at center — strong at the bottom, softer at the top. */}
      <LinearGradient
        colors={[
          "rgba(6, 7, 10, 0.7)",
          "rgba(6, 7, 10, 0.4)",
          "transparent",
          "rgba(6, 7, 10, 0.78)",
          "rgba(6, 7, 10, 0.97)",
        ]}
        locations={[0, 0.32, 0.5, 0.7, 1]}
        style={styles.glass}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressedDim]}
        >
          <AppIcon icon={SidebarLeftIcon} size={20} color="#fff" strokeWidth={1.9} />
        </Pressable>
        <View style={styles.flex} />
        <BrandLogo width={104} color="rgba(255, 255, 255, 0.55)" />
        <View style={styles.flex} />
        <Pressable
          onPress={openNewTask}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New task"
          style={({ pressed }) => [styles.newTaskBtn, pressed && styles.pressedDim]}
        >
          <AppIcon icon={Add01Icon} size={20} color={colors.white} strokeWidth={1.9} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {/* Feed: On my plate + Up next on the right column. The date and
              greeting are docked just above the heatmap (see calendarFooter). */}
          <View style={styles.heroRow}>
            <View style={styles.heroLeft} />
            <View style={styles.heroRight}>
              <SectionHeader
                flush
                label="On my plate"
                action={topIssues.length > 0 ? { icon: ArrowRight01Icon, label: "See all tasks", onPress: openMyTasks } : undefined}
              />
              {topIssues.length > 0 ? (
                <View style={styles.list}>
                  {topIssues.map((issue) => (
                    <Pressable
                      key={issue.id}
                      onPress={() => openIssue(issue)}
                      accessibilityRole="button"
                      accessibilityLabel={issue.name}
                      style={({ pressed }) => pressed && styles.pressedDim}
                    >
                      <View style={styles.listRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {issue.name}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>You&apos;re all caught up.</Text>
              )}

              {/* Up next — same column / width as On my plate */}
              <SectionHeader
                label="Up next"
                action={topMeetings.length > 0 ? { icon: Calendar01Icon, label: "Open calendar", onPress: openCalendar } : undefined}
              />
              {topMeetings.length > 0 ? (
                <View style={styles.list}>
                  {topMeetings.map((meeting) => (
                    <Pressable
                      key={meeting.id}
                      onPress={openCalendar}
                      accessibilityRole="button"
                      accessibilityLabel={meeting.title || "Untitled event"}
                      style={({ pressed }) => pressed && styles.pressedDim}
                    >
                      <View style={styles.listRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {meeting.title || "Untitled event"}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>{error ?? "No upcoming events."}</Text>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Activity heatmap — docked at the bottom, always visible */}
        <View style={styles.calendarFooter}>
          {/* Editorial date + greeting, sitting just above the heatmap:
              "27 June" with the greeting beneath it in Newsreader italic. */}
          <View style={styles.footerDate}>
            <Text style={styles.dateLine}>
              {today.getDate()} {MONTHS[today.getMonth()].charAt(0) + MONTHS[today.getMonth()].slice(1).toLowerCase()}
            </Text>
            <Text style={styles.footerGreeting}>
              {greeting(today)}, {firstName}
            </Text>
          </View>
          <SectionHeader flush label="Heatmap activity" />
          <View style={styles.calendar}>
            <View style={styles.weekRow}>
              {WEEKDAY_LETTERS.map((letter, index) => (
                <Text
                  key={`h-${index}`}
                  style={[styles.weekdayLetter, index === todayColumn && styles.weekdayLetterToday]}
                >
                  {letter}
                </Text>
              ))}
            </View>
            {rows.map((week, weekIndex) => (
              <View key={`w-${weekIndex}`} style={styles.weekRow}>
                {week.map((cell, dayIndex) => (
                  <View key={`d-${weekIndex}-${dayIndex}`} style={styles.dayCell}>
                    {cell ? <View style={dotStyles(cell, maxCount)} /> : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
        </>
      )}
    </SafeAreaView>
    </ImageBackground>
    </AtlasPeek>
  );
}

const styles = StyleSheet.create({
  // Goya "Saturn" as the home backdrop over black, shown near-full so the
  // painting reads; the glass layer below frosts the docked bottom content.
  bg: { flex: 1, backgroundColor: "#000" },
  bgImage: { opacity: 0.85 },
  // Strong dark "glass" from both edges (top + bottom), fading to clear at the
  // center — frames the painting and backs the top + bottom content clusters.
  glass: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  safe: { flex: 1, backgroundColor: "transparent" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  pressedDim: { opacity: 0.55 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  // Subtle gray chip — same shape/size as the brand "new task" chip on the
  // right, so the two top-bar actions read as a matched pair.
  iconBtn: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  // Filled brand chip — paired with the gray toggle chip on the left.
  newTaskBtn: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },

  // Two-column hero: empty spacer (left) + On my plate / Up next (right).
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  heroLeft: { flex: 1.5 },
  heroRight: { flex: 1 },

  // Editorial date + greeting docked just above the heatmap.
  footerDate: { marginBottom: spacing.xxl },
  // "27 June" — day number and month together on one line.
  dateLine: { fontSize: font.size.xxl, color: "#fff", fontFamily: "Figtree_700Bold" },
  // Greeting beneath the date — Newsreader serif. iOS matches by the ttf's
  // internal family name ("Newsreader") + fontStyle, not the useFonts key.
  footerGreeting: { marginTop: spacing.xs, fontSize: font.size.xl, color: "rgba(255, 255, 255, 0.85)", fontFamily: "Newsreader" },

  // Dot-grid calendar
  // Heatmap is docked at the bottom of the screen (outside the ScrollView), so
  // it's always visible no matter how far the feed above scrolls.
  calendarFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  calendar: { gap: spacing.sm, marginTop: spacing.sm },
  weekRow: { flexDirection: "row", gap: spacing.sm },
  weekdayLetter: { flex: 1, textAlign: "center", fontSize: font.size.xs, color: "rgba(255, 255, 255, 0.5)", fontFamily: "Figtree_600SemiBold" },
  weekdayLetterToday: { color: colors.brand },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dot: { width: "100%", aspectRatio: 1, borderRadius: radius.pill, backgroundColor: "rgba(255, 255, 255, 0.12)" },
  // Empty (no activity) vs future (after today) vs the brand intensity ramp.
  dotEmpty: { backgroundColor: "rgba(255, 255, 255, 0.12)" },
  dotFuture: { backgroundColor: "rgba(255, 255, 255, 0.06)" },
  dotL1: { backgroundColor: "rgba(170, 2, 118, 0.32)" },
  dotL2: { backgroundColor: "rgba(170, 2, 118, 0.62)" },
  dotL3: { backgroundColor: colors.brand },
  // Today always gets a ring so it's locatable even on a zero-activity day.
  dotToday: { borderWidth: 2, borderColor: colors.brand },

  // Minimal text lists
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeaderFlush: { marginTop: 0 },
  sectionLabel: { fontSize: font.size.xs, color: "rgba(255, 255, 255, 0.5)", fontFamily: "Figtree_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  sectionActionBtn: { alignItems: "center", justifyContent: "center" },

  list: { gap: spacing.xs },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  priorityDot: { height: 8, width: 8, borderRadius: radius.pill },
  rowTitle: { flex: 1, fontSize: font.size.sm, color: "#fff", fontFamily: "Figtree_500Medium" },
  rowMeta: { fontSize: font.size.xs, color: "rgba(255, 255, 255, 0.5)", fontFamily: "Figtree_500Medium" },
  rowMetaAccent: { fontSize: font.size.xs, color: colors.brandText, fontFamily: "Figtree_600SemiBold" },

  emptyText: { fontSize: font.size.sm, color: "rgba(255, 255, 255, 0.7)", fontFamily: "Figtree_400Regular", paddingVertical: spacing.sm },
});
