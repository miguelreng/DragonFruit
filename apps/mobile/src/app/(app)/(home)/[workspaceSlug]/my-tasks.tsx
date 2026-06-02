import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { IssueRow } from "@/components/issue-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getMyIssues, getProjects, isAuthError, type IssueListItem } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function MyTasksScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { user, signOut } = useSession();

  const [issues, setIssues] = useState<IssueListItem[]>([]);
  // project_id -> identifier, so we can show "PROJ-123" across projects.
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const [myIssues, projects] = await Promise.all([getMyIssues(workspaceSlug, user.id), getProjects(workspaceSlug)]);
      setIssues(myIssues);
      setIdentifiers(Object.fromEntries(projects.map((project) => [project.id, project.identifier])));
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load your tasks. Pull to retry.");
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

  const openIssue = (issue: IssueListItem) =>
    router.push({
      pathname: "/[workspaceSlug]/issue/[issueId]",
      params: { workspaceSlug, issueId: issue.id, projectId: issue.project_id, name: issue.name },
    });

  return (
    <View style={styles.safe}>
      <ScreenHeader title="My tasks" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
        <FlatList
          data={issues}
          keyExtractor={(issue) => issue.id}
          contentContainerStyle={issues.length === 0 ? styles.listContentEmpty : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState
              icon={CheckmarkCircle02Icon}
              title={error ? "Couldn't load your tasks" : "You're all caught up"}
              body={error ? "Pull to retry." : "Work items assigned to you across this workspace show up here."}
            />
          }
          renderItem={({ item }) => {
            const code = identifiers[item.project_id];
            const ref = code ? `${code}-${item.sequence_id}` : `#${item.sequence_id}`;
            return <IssueRow issue={item} reference={ref} onPress={() => openIssue(item)} />;
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
});
