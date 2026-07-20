import { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import { FilterPills } from "@/components/filter-pills";
import { PressableScale } from "@/components/pressable-scale";
import { ScrollFade } from "@/components/scroll-fade";
import { getPages, getProjects, type PageListItem, type Project } from "@/lib/api";
import { selectionHaptic } from "@/lib/haptics";
import { ArrowLeft01Icon, File01Icon, Folder01Icon, GlobeIcon, Pdf01Icon, Search01Icon } from "@/lib/icons";
import { colors, font, radius, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

type BreadcrumbEntry = { id: string; name: string };

function addedDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Added recently";

  return `Added ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" as const }),
  })}`;
}

export function DocsDirectory({ workspaceSlug, projectId }: { workspaceSlug: string; projectId?: string }) {
  const reducedMotion = useReducedMotion();
  const [navigationStack, setNavigationStack] = useState<BreadcrumbEntry[]>([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(width);
  // The docs rail can briefly report the full swipe-rail width while the hub is
  // laying out. Keep the grid tied to the actual viewport so the second column
  // never renders off-screen during that pass.
  const gridWidth = Math.min(containerWidth, width);
  const cardWidth = Math.max(0, (gridWidth - spacing.lg * 2 - spacing.md) / 2);

  const {
    data: allPages,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<PageListItem>(async () => {
    const pages = await getPages(workspaceSlug);
    return projectId ? pages.filter((page) => page.project_ids?.includes(projectId)) : pages;
  }, [workspaceSlug, projectId]);

  const { data: projects } = useApiList<Project>(() => getProjects(workspaceSlug), [workspaceSlug]);
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const accessibleProjectIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);

  const activePages = useMemo(
    () => allPages.filter((page) => page.archived_at === null && page.page_type !== "whiteboard"),
    [allPages]
  );
  const activePageIds = useMemo(() => new Set(activePages.map((page) => page.id)), [activePages]);
  const activeFolderIds = useMemo(
    () => new Set(activePages.filter((page) => page.page_type === "folder").map((page) => page.id)),
    [activePages]
  );

  // If a folder is removed during refresh, show the closest valid ancestor
  // without scheduling another render from an effect.
  const stack = useMemo(() => {
    const firstMissing = navigationStack.findIndex((entry) => !activeFolderIds.has(entry.id));
    return firstMissing >= 0 ? navigationStack.slice(0, firstMissing) : navigationStack;
  }, [activeFolderIds, navigationStack]);
  const currentFolderId = stack.length > 0 ? stack[stack.length - 1].id : null;
  const currentFolderName = stack.length > 0 ? stack[stack.length - 1].name : null;

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const level = normalizedQuery
      ? activePages.filter((page) =>
          `${page.name} ${page.description_snippet}`.toLocaleLowerCase().includes(normalizedQuery)
        )
      : activePages.filter((page) => {
          if (currentFolderId) return page.parent === currentFolderId;
          return !page.parent || !activePageIds.has(page.parent);
        });
    const scoped = projectFilter ? level.filter((page) => page.project_ids?.includes(projectFilter)) : level;
    return [...scoped].sort((a, b) => {
      const aIsFolder = a.page_type === "folder" ? 0 : 1;
      const bIsFolder = b.page_type === "folder" ? 0 : 1;
      if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder;
      const addedDifference = Date.parse(b.created_at) - Date.parse(a.created_at);
      if (Number.isFinite(addedDifference) && addedDifference !== 0) return addedDifference;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [activePageIds, activePages, currentFolderId, query, projectFilter]);

  // Projects that actually own docs here — the filter-pill options.
  const projectOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const page of activePages) {
      for (const pid of page.project_ids ?? []) if (projectNameById[pid]) ids.add(pid);
    }
    return [...ids].map((id) => ({ id, label: projectNameById[id] })).sort((a, b) => a.label.localeCompare(b.label));
  }, [activePages, projectNameById]);

  // Direct child count per folder (non-archived pages only)
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of activePages) {
      if (p.parent) counts[p.parent] = (counts[p.parent] ?? 0) + 1;
    }
    return counts;
  }, [activePages]);

  const drillIntoFolder = (folder: PageListItem) => {
    selectionHaptic();
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (query.trim()) {
      const path: BreadcrumbEntry[] = [];
      let cursor: PageListItem | undefined = folder;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        path.unshift({ id: cursor.id, name: cursor.name || "Untitled" });
        cursor = cursor.parent ? activePages.find((page) => page.id === cursor?.parent) : undefined;
      }
      setQuery("");
      setNavigationStack(path);
      return;
    }
    setNavigationStack([...stack, { id: folder.id, name: folder.name || "Untitled" }]);
  };

  const navigateBack = () => {
    selectionHaptic();
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (query) {
      setQuery("");
      return;
    }
    setNavigationStack(stack.slice(0, -1));
  };

  useEffect(() => {
    if (stack.length === 0 && !query) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (query) {
        setQuery("");
        return true;
      }
      setNavigationStack((current) => current.slice(0, -1));
      return true;
    });
    return () => subscription.remove();
  }, [query, stack.length]);

  const openDoc = (page: PageListItem) => {
    selectionHaptic();
    // Prefer a project the user actually has access to — `project_ids[0]` can
    // be a project they were removed from, which 403s the page fetch.
    const accessibleProjectId = page.project_ids?.find((id) => accessibleProjectIds.has(id));
    router.push({
      pathname: "/[workspaceSlug]/doc/[pageId]",
      params: {
        workspaceSlug,
        pageId: page.id,
        projectId: accessibleProjectId ?? page.project_ids?.[0] ?? "",
        name: page.name || "Untitled",
        pageType: page.page_type,
      },
    });
  };

  return (
    <View
      style={[styles.root, { width }]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== containerWidth) setContainerWidth(Math.min(nextWidth, width));
      }}
    >
      <View style={styles.dirHeader}>
        <View style={styles.dirTitleRow}>
          {stack.length > 0 ? (
            <PressableScale
              onPress={navigateBack}
              accessibilityRole="button"
              accessibilityLabel="Back to parent folder"
            >
              <View style={styles.backBtn}>
                <AppIcon icon={ArrowLeft01Icon} size={17} color={colors.ink} />
              </View>
            </PressableScale>
          ) : null}
          <Text style={styles.dirTitle} numberOfLines={1}>
            {query ? "Search docs" : (currentFolderName ?? "Docs")}
          </Text>
        </View>
        <View style={styles.searchField}>
          <AppIcon icon={Search01Icon} size={17} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search docs and folders"
            placeholderTextColor={colors.textPlaceholder}
            returnKeyType="search"
            accessibilityLabel="Search docs and folders"
            style={styles.searchInput}
          />
        </View>
      </View>

      {!projectId && !query && stack.length === 0 && projectOptions.length > 1 ? (
        <FilterPills options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade topHeight={20} bottomHeight={80}>
          <FlatList
            data={items}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <AppIcon icon={stack.length > 0 ? Folder01Icon : File01Icon} size={44} color={colors.borderStrong} />
                <Text style={styles.emptyTitle}>
                  {error
                    ? "Couldn't load docs"
                    : query
                      ? "No matching docs"
                      : stack.length > 0
                        ? "Empty folder"
                        : "No docs yet"}
                </Text>
                <Text style={styles.emptyBody}>
                  {error
                    ? "Pull to retry."
                    : query
                      ? "Try a different name or keyword."
                      : stack.length > 0
                        ? "This folder has no content."
                        : "Docs and folders will appear here."}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.page_type === "folder") {
                const count = childCounts[item.id] ?? 0;
                const projectName = item.project_ids?.[0] ? projectNameById[item.project_ids[0]] : undefined;
                const metaText = [addedDateLabel(item.created_at), count === 1 ? "1 doc" : `${count} docs`, projectName]
                  .filter(Boolean)
                  .join(" · ");
                const published = item.access === 0;
                return (
                  <View style={{ width: cardWidth }}>
                    <PressableScale
                      onPress={() => drillIntoFolder(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name || "Untitled"}, folder, ${count} item${count !== 1 ? "s" : ""}`}
                      style={({ pressed }) => [
                        styles.cardPressable,
                        styles.folderPressable,
                        pressed && styles.cardPressed,
                      ]}
                    >
                      <View style={styles.folderCard}>
                        <View style={styles.folderTab}>
                          <Text style={styles.folderTabLabel} numberOfLines={1}>
                            {item.name || "Untitled"}
                          </Text>
                        </View>
                        <View style={styles.folderBack} />
                        <View style={styles.folderSlot} />
                        {count > 0 ? <View style={[styles.folderPaper, styles.folderPaperLeft]} /> : null}
                        {count > 1 ? <View style={[styles.folderPaper, styles.folderPaperCenter]} /> : null}
                        {count > 2 ? <View style={[styles.folderPaper, styles.folderPaperRight]} /> : null}
                        <View style={styles.folderFront}>
                          <LinearGradient
                            colors={["rgba(29,31,32,0)", "rgba(29,31,32,0.22)"]}
                            style={styles.folderFrontShade}
                            pointerEvents="none"
                          />
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {item.name || "Untitled"}
                          </Text>
                          <View style={styles.folderMetaRow}>
                            <Text style={[styles.cardMeta, styles.folderMetaText]} numberOfLines={1}>
                              {metaText}
                            </Text>
                            {published ? (
                              <View style={styles.folderPublished}>
                                <Text style={styles.cardMeta}>·</Text>
                                <AppIcon icon={GlobeIcon} size={11} color={colors.textPlaceholder} />
                                <Text style={styles.cardMeta}>Published</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </PressableScale>
                  </View>
                );
              }

              const isPdf = item.page_type === "pdf";
              return (
                <View style={{ width: cardWidth }}>
                  <PressableScale
                    onPress={() => openDoc(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.name || "Untitled"}
                    style={({ pressed }) => [styles.cardPressable, styles.docPressable, pressed && styles.cardPressed]}
                  >
                    <View style={styles.docCard}>
                      <View style={styles.docPreview}>
                        <View style={[styles.docTypeIcon, isPdf && styles.pdfTypeIcon]}>
                          <AppIcon
                            icon={isPdf ? Pdf01Icon : File01Icon}
                            size={18}
                            color={isPdf ? colors.danger : colors.textSecondary}
                          />
                        </View>
                        <View style={styles.previewLines}>
                          <View style={[styles.previewLine, { width: "82%" }]} />
                          <View style={[styles.previewLine, { width: "66%" }]} />
                          <View style={[styles.previewLine, { width: "74%" }]} />
                        </View>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.name || "Untitled"}
                      </Text>
                      <Text style={[styles.cardMeta, styles.docMeta]}>
                        {isPdf ? "PDF" : item.page_type === "sheet" ? "Sheet" : "Doc"} ·{" "}
                        {addedDateLabel(item.created_at)}
                      </Text>
                    </View>
                  </PressableScale>
                </View>
              );
            }}
          />
        </ScrollFade>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  dirHeader: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.canvas,
  },
  dirTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  dirTitle: {
    flex: 1,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.xxl,
    color: colors.ink,
    letterSpacing: -0.45,
  },
  searchField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.layer1Hover,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    paddingVertical: 0,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  gridRow: { gap: spacing.md },
  emptyContainer: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.base,
    color: colors.ink,
    marginTop: spacing.md,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.sm,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  cardPressable: { borderRadius: radius.lg },
  folderPressable: { height: 156 },
  docPressable: { minHeight: 156 },
  cardPressed: { opacity: 0.78 },
  folderCard: {
    // Every layer below is absolutely positioned, so this box is their sole
    // positioning context — it needs a definite height. `flex: 1` collapses to
    // 0 when measured inside the animated PressableScale on the New Arch, which
    // inverts the whole folder (front floats up, papers drop out). Pin the
    // height to the pressable's fixed 156 so the offsets always resolve.
    height: 156,
    position: "relative",
  },
  folderTab: {
    position: "absolute",
    top: 0,
    left: spacing.md,
    width: "46%",
    height: 38,
    paddingTop: 4,
    paddingHorizontal: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.layer1Active,
    transform: [{ skewX: "10deg" }],
  },
  // Counter-skew the label so it reads flat inside the slanted tab (mirrors the
  // small folder-name echo on the web folder card).
  folderTabLabel: {
    transform: [{ skewX: "-10deg" }],
    color: colors.textTertiary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.2,
    opacity: 0.8,
  },
  folderBack: {
    position: "absolute",
    top: 18,
    right: 0,
    bottom: 4,
    left: 0,
    borderRadius: 22,
    backgroundColor: colors.layer1Active,
  },
  folderSlot: {
    position: "absolute",
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  folderPaper: {
    position: "absolute",
    zIndex: 2,
    top: 34,
    width: "30%",
    height: 76,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  folderPaperLeft: { left: "17%", transform: [{ rotate: "-8deg" }] },
  folderPaperCenter: {
    left: "35%",
    top: 29,
    height: 84,
    transform: [{ rotate: "1deg" }],
  },
  folderPaperRight: { right: "17%", transform: [{ rotate: "8deg" }] },
  folderFront: {
    position: "absolute",
    zIndex: 3,
    right: 0,
    bottom: 0,
    left: 0,
    height: 104,
    justifyContent: "flex-end",
    borderRadius: 22,
    padding: spacing.lg,
    backgroundColor: colors.layer1Active,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.92)",
  },
  folderFrontShade: {
    position: "absolute",
    zIndex: 4,
    top: -15,
    left: 4,
    right: 4,
    height: 15,
  },
  docCard: {
    // No flex:1 — the pressable only sets minHeight, so this must size to its
    // own content (preview + title + meta) rather than fight for a stretched
    // height, otherwise long titles/meta overflow the card.
    flexGrow: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.layer1,
  },
  docPreview: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  docTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.layer1Hover,
  },
  pdfTypeIcon: { backgroundColor: colors.dangerSoft },
  previewLines: { marginTop: spacing.sm, gap: 4 },
  previewLine: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  cardTitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontFamily: "Figtree_600SemiBold",
    fontSize: font.size.sm,
    lineHeight: 17,
  },
  cardMeta: {
    color: colors.textPlaceholder,
    fontFamily: "Figtree_400Regular",
    fontSize: font.size.xs,
  },
  docMeta: { marginTop: 2 },
  folderMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  folderMetaText: { flexShrink: 1 },
  folderPublished: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
});
