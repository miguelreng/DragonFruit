import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { File01Icon, GridViewIcon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getPages, type PageListItem } from "@/lib/api";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

export default function DocsScreen() {
  const { workspaceSlug, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    projectId?: string;
    name?: string;
  }>();
  // Workspace pages include their project association (`project_ids`), so when a
  // project is given we filter the known-good workspace list rather than relying
  // on a separate project-pages response shape.
  const {
    data: pages,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<PageListItem>(
    async () => {
      const all = await getPages(workspaceSlug);
      return projectId ? all.filter((page) => page.project_ids?.includes(projectId)) : all;
    },
    [workspaceSlug, projectId]
  );

  const openDoc = (page: PageListItem) =>
    router.push({
      pathname: "/[workspaceSlug]/doc/[pageId]",
      params: {
        workspaceSlug,
        pageId: page.id,
        projectId: page.project_ids?.[0] ?? "",
        name: page.name || "Untitled",
        pageType: page.page_type,
      },
    });

  return (
    <View style={styles.safe}>
      <ScreenHeader title={projectId ? name ?? "Docs" : "Docs"} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          numColumns={2}
          columnWrapperStyle={pages.length === 0 ? undefined : styles.row}
          contentContainerStyle={pages.length === 0 ? styles.listContentEmpty : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState
              icon={File01Icon}
              title={error ? "Couldn't load docs" : "No docs yet"}
              body={
                error
                  ? "Pull to retry."
                  : projectId
                    ? "Docs created in this project will appear here."
                    : "Docs across this workspace will appear here."
              }
            />
          }
          renderItem={({ item }) => {
            const isWhiteboard = item.page_type === "whiteboard";
            return (
              <Pressable
                onPress={() => openDoc(item)}
                accessibilityRole="button"
                accessibilityLabel={item.name || "Untitled"}
                style={({ pressed }) => [styles.docCard, pressed && styles.cardPressed]}
              >
                {/* Preview pane: a faux page surface that hints at the doc body. */}
                <View style={styles.preview}>
                  {item.description_snippet ? (
                    <Text style={styles.previewText} numberOfLines={6}>
                      {item.description_snippet}
                    </Text>
                  ) : (
                    <View style={styles.previewEmpty}>
                      <AppIcon
                        icon={isWhiteboard ? GridViewIcon : File01Icon}
                        size={28}
                        color={colors.borderStrong}
                        strokeWidth={1.6}
                      />
                    </View>
                  )}
                </View>

                {/* Footer: title. */}
                <View style={styles.docRow}>
                  <Text style={styles.docTitle} numberOfLines={2}>
                    {item.name || "Untitled"}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
        </ScrollFade>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  listContentEmpty: { flexGrow: 1, paddingHorizontal: 20 },
  row: { gap: spacing.md },
  docCard: {
    flex: 1,
    minWidth: 0,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.6 },
  preview: {
    height: 116,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    overflow: "hidden",
  },
  previewText: {
    fontSize: font.size.xs,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  docTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: font.size.sm,
    lineHeight: 18,
    color: colors.ink,
    fontFamily: "Figtree_600SemiBold",
  },
});
