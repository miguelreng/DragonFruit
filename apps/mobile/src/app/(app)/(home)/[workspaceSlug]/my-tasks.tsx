import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { getMyIssues, getProjects, isAuthError, type IssueListItem } from "@/lib/api";
import { PRIORITY_COLOR } from "@/lib/format";
import { useSession } from "@/lib/session";

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
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="My tasks" subtitle="Assigned to you" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : (
        <FlatList
          data={issues}
          keyExtractor={(issue) => issue.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e445a6" />}
          ListEmptyComponent={
            <Text className="text-sm text-muted mt-10 text-center">{error ?? "Nothing assigned to you here."}</Text>
          }
          renderItem={({ item }) => {
            const code = identifiers[item.project_id];
            const ref = code ? `${code}-${item.sequence_id}` : `#${item.sequence_id}`;
            return (
              <Pressable
                onPress={() => openIssue(item)}
                className="mb-2 flex-row items-center gap-3 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
              >
                <View
                  style={{ backgroundColor: PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.none }}
                  className="h-2.5 w-2.5 rounded-full"
                />
                <View className="flex-1">
                  <Text className="text-base text-ink font-medium" numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-muted mt-0.5">{ref}</Text>
                </View>
                <Text className="text-xl text-muted">›</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
