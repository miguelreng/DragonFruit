import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Cancel01Icon, File01Icon, Folder02Icon, Task01Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { globalSearch, isAuthError, type GlobalSearchResults } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

const EMPTY: GlobalSearchResults = { issue: [], page: [], project: [] };

export default function SearchScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { signOut } = useSession();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Debounced search — only the latest in-flight request is allowed to win.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const data = await globalSearch(workspaceSlug, q);
        if (id === reqId.current) setResults(data);
      } catch (err) {
        if (isAuthError(err)) {
          await signOut();
          return;
        }
        if (id === reqId.current) setError("Search failed. Try again.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, workspaceSlug, signOut]);

  const total = results.issue.length + results.page.length + results.project.length;
  const hasQuery = query.trim().length >= 2;

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Search" />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search issues, docs, projects"
          placeholderTextColor={colors.textPlaceholder}
          style={styles.searchInput}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search query"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
            <AppIcon icon={Cancel01Icon} size={18} color={colors.faint} strokeWidth={1.9} />
          </Pressable>
        ) : null}
      </View>

      <ScrollFade bottomHeight={64}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : !hasQuery ? (
          <Text style={styles.hint}>Type at least 2 characters to search.</Text>
        ) : error ? (
          <Text style={styles.hint}>{error}</Text>
        ) : total === 0 ? (
          <Text style={styles.hint}>No results for “{query.trim()}”.</Text>
        ) : (
          <>
            {results.issue.length > 0 ? <Text style={styles.sectionLabel}>Work items</Text> : null}
            {results.issue.map((item) => (
              <ResultRow
                key={item.id}
                icon={Task01Icon}
                title={item.name}
                subtitle={`${item.project__identifier}-${item.sequence_id}`}
                onPress={() =>
                  router.push({
                    pathname: "/[workspaceSlug]/issue/[issueId]",
                    params: { workspaceSlug, issueId: item.id, projectId: item.project_id, name: item.name },
                  })
                }
              />
            ))}

            {results.page.length > 0 ? <Text style={styles.sectionLabel}>Docs</Text> : null}
            {results.page.map((item) => (
              <ResultRow
                key={item.id}
                icon={File01Icon}
                title={item.name || "Untitled"}
                onPress={() =>
                  router.push({
                    pathname: "/[workspaceSlug]/doc/[pageId]",
                    params: {
                      workspaceSlug,
                      pageId: item.id,
                      projectId: item.project_ids?.[0] ?? "",
                      name: item.name || "Untitled",
                    },
                  })
                }
              />
            ))}

            {results.project.length > 0 ? <Text style={styles.sectionLabel}>Projects</Text> : null}
            {results.project.map((item) => (
              <ResultRow
                key={item.id}
                icon={Folder02Icon}
                title={item.name}
                subtitle={item.identifier}
                onPress={() =>
                  router.push({
                    pathname: "/[workspaceSlug]/project/[projectId]",
                    params: { workspaceSlug, projectId: item.id, name: item.name },
                  })
                }
              />
            ))}
          </>
        )}
      </ScrollView>
      </ScrollFade>
    </View>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: Parameters<typeof AppIcon>[0]["icon"];
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.rowPressed]}>
          <AppIcon icon={icon} size={18} color={colors.body} strokeWidth={1.9} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { paddingTop: 48, alignItems: "center", justifyContent: "center" },
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_400Regular" },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  hint: { marginTop: 40, textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: font.size.xs,
    color: colors.faint,
    fontFamily: "Figtree_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.layerTransparentHover },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.size.md, color: colors.ink, fontFamily: "Figtree_500Medium" },
  rowSubtitle: { marginTop: 1, fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular" },
});
