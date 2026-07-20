import { useState } from "react";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowRight01Icon,
  Bell,
  Bookmark,
  Calendar01Icon,
  File02Icon,
  Folder01Icon,
  Folder02Icon,
  Home01Icon,
  PlusSignIcon,
  RepeatIcon,
  Search01Icon,
  SparklesIcon,
  StickyNote02Icon,
  Task01Icon,
} from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { PressableScale } from "@/components/pressable-scale";
import { Avatar } from "@/components/avatar";
import { ProjectLogo } from "@/components/project-logo";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { getFavorites, getProjects, getWorkspaces, type Favorite, type Project, type Workspace } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

type SidebarProps = { navigation: { closeDrawer: () => void } };

// One size for every icon/logo in the sidebar, so the left column lines up.
const ICON_SIZE = 20;

// Favorites can pin any entity type; pick a matching glyph and a display label.
function favoriteIcon(type: string): Parameters<typeof AppIcon>[0]["icon"] {
  if (type === "project") return Folder02Icon;
  if (type === "page") return File02Icon;
  if (type === "cycle" || type === "module") return RepeatIcon;
  return Task01Icon;
}

function favoriteLabel(fav: Favorite): string {
  return fav.name || fav.entity_data?.name || fav.entity_type;
}

/**
 * Workspace mark: the uploaded logo image when set, else an initials avatar.
 * Falls back to initials if the image is missing or fails to load, so the slot
 * is never blank.
 */
function WorkspaceLogo({ logoUrl, name, size = ICON_SIZE }: { logoUrl?: string | null; name: string; size?: number }) {
  return <Avatar name={name} size={size} imageUrl={logoUrl} />;
}

type ItemRowProps = {
  icon?: Parameters<typeof AppIcon>[0]["icon"];
  /** Custom leading element (e.g. a logo). Overrides `icon` when provided. */
  leading?: React.ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

function ItemRow({ icon, leading, label, active, onPress, trailing }: ItemRowProps) {
  // The row layout lives on an inner View, not on the Pressable: under RN 0.85's
  // New Architecture, a Pressable rendered inside the drawer drops `flexDirection`
  // (its children stack vertically), while a plain View lays out correctly.
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.rowOuter, active && styles.itemRowActive, pressed && styles.itemRowPressed]}
    >
      <View style={styles.itemRow}>
        {leading ??
          (icon ? (
            <AppIcon icon={icon} size={ICON_SIZE} color={active ? colors.ink : colors.faint} strokeWidth={1.9} />
          ) : null)}
        <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
          {label}
        </Text>
        {trailing}
      </View>
    </PressableScale>
  );
}

export function AppSidebar({ navigation }: SidebarProps) {
  const { user, signOut } = useSession();
  const { workspaceSlug, name } = useGlobalSearchParams<{ workspaceSlug?: string; name?: string }>();
  const pathname = usePathname();
  const { data: projects } = useApiList<Project>(
    () => (workspaceSlug ? getProjects(workspaceSlug) : Promise.resolve([])),
    [workspaceSlug]
  );
  const { data: favorites } = useApiList<Favorite>(
    () => (workspaceSlug ? getFavorites(workspaceSlug) : Promise.resolve([])),
    [workspaceSlug]
  );
  const { data: workspaces } = useApiList<Workspace>(getWorkspaces, []);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [favsOpen, setFavsOpen] = useState(false);
  // Which project tree nodes are expanded. Pressing a project name toggles its
  // entry here (showing its children) instead of navigating to the project.
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const toggleProject = (id: string) =>
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const currentWorkspace = workspaces.find((w) => w.slug === workspaceSlug);

  const displayName = user?.display_name || user?.first_name || user?.email || "You";
  // Prefer the fetched workspace's real name; fall back to the URL `name` param
  // or the slug (de-slugified) until the workspaces list loads.
  const workspaceName =
    currentWorkspace?.name ??
    (typeof name === "string" && name.trim().length > 0 ? name : (workspaceSlug ?? "Workspace")).replace(/-/g, " ");

  // Which top-level destination the current route maps to, so the matching
  // sidebar row shows as active when the drawer is opened from that screen.
  const isDocs = pathname.endsWith("/docs") || pathname.includes("/doc/");
  const isBookmarks = pathname.endsWith("/bookmarks");
  const isStickies = pathname.endsWith("/stickies");
  const isCalendar = pathname.endsWith("/calendar");
  const isSearch = pathname.endsWith("/search");
  const isAtlas = pathname.endsWith("/atlas");
  const isNotifications = pathname.endsWith("/notifications");
  // Home is the workspace root only — not every non-docs screen.
  const isHome = !!workspaceSlug && (pathname === `/${workspaceSlug}` || pathname === `/${workspaceSlug}/`);

  // Navigate within the current workspace, closing the drawer first. These
  // views all sit at the same level, so `replace` swaps the current one instead
  // of stacking — no drill-down slide, and the edge swipe keeps opening the
  // sidebar. "New task" is the exception: it's a form you push and back out of.
  const go = (
    path:
      | "/[workspaceSlug]"
      | "/[workspaceSlug]/my-tasks"
      | "/[workspaceSlug]/docs"
      | "/[workspaceSlug]/new-task"
      | "/[workspaceSlug]/search"
      | "/[workspaceSlug]/notifications"
      | "/[workspaceSlug]/bookmarks"
      | "/[workspaceSlug]/stickies"
      | "/[workspaceSlug]/calendar"
      | "/[workspaceSlug]/atlas"
      | "/[workspaceSlug]/profile"
  ) => {
    if (!workspaceSlug) return;
    navigation.closeDrawer();
    if (path === "/[workspaceSlug]/new-task") {
      router.push({ pathname: path, params: { workspaceSlug } });
    } else {
      router.replace({ pathname: path, params: { workspaceSlug } });
    }
  };

  const openProject = (project: Project) => {
    if (!workspaceSlug) return;
    navigation.closeDrawer();
    router.push({
      pathname: "/[workspaceSlug]/project/[projectId]",
      params: { workspaceSlug, projectId: project.id, name: project.name },
    });
  };

  // Open the featured project's docs. The docs screen reads the optional
  // projectId+name params and filters to that project; without them it shows
  // the workspace-wide pages (the sidebar's top-level "Docs" link).
  const openProjectDocs = (project: Project) => {
    if (!workspaceSlug) return;
    navigation.closeDrawer();
    router.replace({
      pathname: "/[workspaceSlug]/docs",
      params: { workspaceSlug, projectId: project.id, name: project.name },
    });
  };

  // Open a favorited entity by type. Mirrors the favorites screen: project/page/
  // issue have native screens; cycles, modules, views and project-less items fall
  // back to the web app so a tap is never a dead end.
  const openFavorite = (fav: Favorite) => {
    if (!workspaceSlug) return;
    const id = fav.entity_identifier;
    navigation.closeDrawer();
    if (fav.entity_type === "project" && id) {
      router.push({
        pathname: "/[workspaceSlug]/project/[projectId]",
        params: { workspaceSlug, projectId: id, name: favoriteLabel(fav) },
      });
      return;
    }
    if (fav.entity_type === "page" && id) {
      router.push({
        pathname: "/[workspaceSlug]/doc/[pageId]",
        params: { workspaceSlug, pageId: id, projectId: fav.project_id ?? "", name: favoriteLabel(fav) },
      });
      return;
    }
    if (fav.entity_type === "issue" && id && fav.project_id) {
      router.push({
        pathname: "/[workspaceSlug]/issue/[issueId]",
        params: { workspaceSlug, issueId: id, projectId: fav.project_id, name: favoriteLabel(fav) },
      });
      return;
    }
    openWeb(`/${workspaceSlug}`);
  };

  const switchWorkspace = (slug: string) => {
    setSwitcherOpen(false);
    const target = workspaces.find((w) => w.slug === slug);
    navigation.closeDrawer();
    router.replace({ pathname: "/[workspaceSlug]", params: { workspaceSlug: slug, name: target?.name ?? slug } });
  };

  const visibleProjects = projects.slice(0, 8);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ItemRow
          leading={<WorkspaceLogo logoUrl={currentWorkspace?.logo_url} name={workspaceName} />}
          label={workspaceName}
          onPress={() => setSwitcherOpen(true)}
          trailing={<AppIcon icon={ArrowDown01Icon} size={ICON_SIZE} color={colors.faint} strokeWidth={1.9} />}
        />

        <ItemRow icon={PlusSignIcon} label="New task" onPress={() => go("/[workspaceSlug]/new-task")} />
        <ItemRow icon={Home01Icon} label="Home" active={isHome} onPress={() => go("/[workspaceSlug]")} />
        <ItemRow icon={Search01Icon} label="Search" active={isSearch} onPress={() => go("/[workspaceSlug]/search")} />
        <ItemRow icon={SparklesIcon} label="Atlas" active={isAtlas} onPress={() => go("/[workspaceSlug]/atlas")} />

        <ItemRow icon={File02Icon} label="Docs" active={isDocs} onPress={() => go("/[workspaceSlug]/docs")} />
        <ItemRow
          icon={Bookmark}
          label="Bookmarks"
          active={isBookmarks}
          onPress={() => go("/[workspaceSlug]/bookmarks")}
        />
        <ItemRow
          icon={StickyNote02Icon}
          label="Stickies"
          active={isStickies}
          onPress={() => go("/[workspaceSlug]/stickies")}
        />
        <ItemRow
          icon={Calendar01Icon}
          label="Calendar"
          active={isCalendar}
          onPress={() => go("/[workspaceSlug]/calendar")}
        />
        <ItemRow
          icon={favsOpen ? Folder02Icon : Folder01Icon}
          label="Favs"
          onPress={() => setFavsOpen((v) => !v)}
          trailing={
            <AppIcon
              icon={favsOpen ? ArrowDown01Icon : ArrowRight01Icon}
              size={ICON_SIZE}
              color={colors.faint}
              strokeWidth={1.9}
            />
          }
        />

        {favsOpen && (
          <View style={styles.projectRailSection}>
            <View style={styles.projectRail} />
            <View style={styles.projectRailContent}>
              {favorites.length === 0 ? (
                <Text style={styles.railEmpty}>No favorites yet</Text>
              ) : (
                favorites.map((fav) => (
                  <Pressable
                    key={fav.id}
                    onPress={() => openFavorite(fav)}
                    accessibilityRole="button"
                    accessibilityLabel={favoriteLabel(fav)}
                    style={({ pressed }) => pressed && styles.pressedDim}
                  >
                    <View style={styles.projectHeaderRow}>
                      <AppIcon
                        icon={favoriteIcon(fav.entity_type)}
                        size={ICON_SIZE}
                        color={colors.faint}
                        strokeWidth={1.9}
                      />
                      <Text style={styles.projectHeaderText} numberOfLines={1}>
                        {favoriteLabel(fav)}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}

        <ItemRow
          icon={projectsOpen ? Folder02Icon : Folder01Icon}
          label="Projects"
          onPress={() => setProjectsOpen((v) => !v)}
          trailing={
            <AppIcon
              icon={projectsOpen ? ArrowDown01Icon : ArrowRight01Icon}
              size={ICON_SIZE}
              color={colors.faint}
              strokeWidth={1.9}
            />
          }
        />

        {projectsOpen && (
          <View style={styles.projectRailSection}>
            <View style={styles.projectRail} />
            <View style={styles.projectRailContent}>
              {visibleProjects.map((project) => {
                const isOpen = openProjects.has(project.id);
                return (
                  <View key={project.id}>
                    {/* Pressing the project name expands/collapses its children
                      rather than navigating — drill in via "Tasks"/"Docs" below. */}
                    <Pressable
                      onPress={() => toggleProject(project.id)}
                      accessibilityRole="button"
                      accessibilityLabel={project.name}
                      accessibilityState={{ expanded: isOpen }}
                      style={({ pressed }) => pressed && styles.pressedDim}
                    >
                      <View style={styles.projectHeaderRow}>
                        <ProjectLogo logo={project.logo_props} name={project.name} size={ICON_SIZE} />
                        <Text style={styles.projectHeaderText} numberOfLines={1}>
                          {project.name}
                        </Text>
                        <AppIcon
                          icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
                          size={ICON_SIZE}
                          color={colors.faint}
                          strokeWidth={1.9}
                        />
                      </View>
                    </Pressable>

                    {isOpen && (
                      <View style={styles.projectChildrenWrap}>
                        <View style={styles.projectChildrenRail} />
                        <View style={styles.projectChildrenList}>
                          <Pressable
                            onPress={() => openProject(project)}
                            accessibilityRole="button"
                            accessibilityLabel={`${project.name} tasks`}
                            style={({ pressed }) => pressed && styles.pressedDim}
                          >
                            <View style={styles.projectChildRow}>
                              <AppIcon icon={Task01Icon} size={ICON_SIZE} color={colors.faint} strokeWidth={1.9} />
                              <Text style={styles.projectChildText}>Tasks</Text>
                            </View>
                          </Pressable>
                          <Pressable
                            onPress={() => openProjectDocs(project)}
                            accessibilityRole="button"
                            accessibilityLabel={`${project.name} docs`}
                            style={({ pressed }) => pressed && styles.pressedDim}
                          >
                            <View style={styles.projectChildRow}>
                              <AppIcon icon={File02Icon} size={ICON_SIZE} color={colors.faint} strokeWidth={1.9} />
                              <Text style={styles.projectChildText}>Docs</Text>
                            </View>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        <ItemRow
          icon={Bell}
          label="Notifications"
          active={isNotifications}
          onPress={() => go("/[workspaceSlug]/notifications")}
        />

        <Pressable
          onPress={() => go("/[workspaceSlug]/profile")}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={({ pressed }) => pressed && styles.pressedDim}
        >
          <View style={styles.profileRow}>
            <Avatar
              name={displayName}
              size={ICON_SIZE}
              circle
              color={colors.brand}
              imageUrl={user?.avatar_url || user?.avatar}
            />
            <Text style={styles.profileText} numberOfLines={1}>
              Profile
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            navigation.closeDrawer();
            void signOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => pressed && styles.pressedDim}
        >
          <View style={styles.signOutRow}>
            <AppIcon icon={ArrowDownLeft01Icon} size={ICON_SIZE} color={colors.faint} strokeWidth={1.9} />
            <Text style={styles.signOutText}>Sign out</Text>
            <AppIcon icon={ArrowRight01Icon} size={ICON_SIZE} color={colors.faint} strokeWidth={1.9} />
          </View>
        </Pressable>
      </ScrollView>

      <WorkspaceSwitcher
        visible={switcherOpen}
        workspaces={workspaces}
        currentSlug={workspaceSlug}
        onSelect={switchWorkspace}
        onClose={() => setSwitcherOpen(false)}
        onCreate={() => {
          navigation.closeDrawer();
          openWeb("/create-workspace");
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Solid subtle gray panel (canvas #f4f5f5) — no glass/fade; the rows fill the
  // full sidebar width.
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
    // Drawer sits on the left; round its right edge (top + bottom corners).
    borderTopRightRadius: radius["2xl"],
    borderBottomRightRadius: radius["2xl"],
    overflow: "hidden",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: 2,
  },

  // Pressable wrapper — visual only (highlight shape); layout is on the inner row.
  rowOuter: { borderRadius: radius.md },
  // Press feedback for rows whose layout/background lives on the inner View
  // (the Pressable can't host the row layout — see ItemRow note).
  pressedDim: { opacity: 0.6 },
  itemRow: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  // Darker than the subtle-gray fade (#f4f5f5) so the active row reads clearly.
  itemRowActive: { backgroundColor: colors.layer1Active },
  itemRowPressed: { backgroundColor: colors.layerTransparentHover },
  itemLabel: { flex: 1, fontSize: font.size.md, color: colors.body, fontFamily: "Figtree_500Medium" },
  itemLabelActive: { color: colors.ink, fontFamily: "Figtree_600SemiBold" },

  projectRailSection: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  projectRail: { width: 2, backgroundColor: colors.border },
  projectRailContent: { flex: 1, gap: spacing.xs },
  projectHeaderRow: {
    minHeight: 42,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  projectHeaderText: { flex: 1, fontSize: font.size.md, color: colors.body, fontFamily: "Figtree_500Medium" },
  projectChildrenWrap: { flexDirection: "row", gap: spacing.md, marginLeft: spacing.xl, marginBottom: spacing.xs },
  projectChildrenRail: { width: 2, backgroundColor: colors.border },
  projectChildrenList: { flex: 1, gap: spacing.xs, paddingVertical: spacing.xs },
  projectChildRow: {
    minHeight: 36,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  projectChildText: { fontSize: font.size.base, color: colors.muted, fontFamily: "Figtree_500Medium" },
  railEmpty: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    fontSize: font.size.base,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: spacing.md },

  profileRow: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  profileText: { flex: 1, fontSize: font.size.md, color: colors.body, fontFamily: "Figtree_500Medium" },

  signOutRow: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  signOutText: { flex: 1, fontSize: font.size.base, color: colors.muted, fontFamily: "Figtree_500Medium" },
});
