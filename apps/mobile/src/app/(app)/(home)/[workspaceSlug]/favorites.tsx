import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ArrowRight01Icon, File01Icon, Folder02Icon, RepeatIcon, Task01Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getFavorites, type Favorite } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

function iconFor(type: string): Parameters<typeof AppIcon>[0]["icon"] {
  if (type === "project") return Folder02Icon;
  if (type === "page") return File01Icon;
  if (type === "cycle" || type === "module") return RepeatIcon;
  return Task01Icon;
}

function labelFor(fav: Favorite): string {
  return fav.name || fav.entity_data?.name || fav.entity_type;
}

export default function FavoritesScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { data: favorites, loading, refreshing, error, onRefresh } = useApiList<Favorite>(
    () => getFavorites(workspaceSlug),
    [workspaceSlug]
  );

  const open = (fav: Favorite) => {
    const id = fav.entity_identifier;
    if (fav.entity_type === "project" && id) {
      router.push({
        pathname: "/[workspaceSlug]/project/[projectId]",
        params: { workspaceSlug, projectId: id, name: labelFor(fav) },
      });
      return;
    }
    if (fav.entity_type === "page" && id) {
      router.push({
        pathname: "/[workspaceSlug]/doc/[pageId]",
        params: { workspaceSlug, pageId: id, projectId: fav.project_id ?? "", name: labelFor(fav) },
      });
      return;
    }
    if (fav.entity_type === "issue" && id && fav.project_id) {
      router.push({
        pathname: "/[workspaceSlug]/issue/[issueId]",
        params: { workspaceSlug, issueId: id, projectId: fav.project_id, name: labelFor(fav) },
      });
      return;
    }
    // Cycles, modules, views and anything project-less: open on web so it's never a dead tap.
    openWeb(`/${workspaceSlug}`);
  };

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Favorites" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
        <FlatList
          data={favorites}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={<Text style={styles.empty}>{error ?? "No favorites yet. Star items on the web app."}</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={labelFor(item)}
            >
              {({ pressed }) => (
                <View style={[styles.card, pressed && styles.cardPressed]}>
                  <AppIcon icon={iconFor(item.entity_type)} size={18} color={colors.body} strokeWidth={1.9} />
                  <View style={styles.body}>
                    <Text style={styles.title} numberOfLines={1}>
                      {labelFor(item)}
                    </Text>
                    <Text style={styles.type}>{item.entity_type}</Text>
                  </View>
                  <AppIcon icon={ArrowRight01Icon} size={18} color={colors.faint} strokeWidth={1.9} />
                </View>
              )}
            </Pressable>
          )}
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
  empty: { marginTop: 40, paddingHorizontal: 24, textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  card: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.card,
  },
  cardPressed: { backgroundColor: colors.layerTransparentHover },
  body: { flex: 1 },
  title: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  type: { marginTop: 1, fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular", textTransform: "capitalize" },
});
