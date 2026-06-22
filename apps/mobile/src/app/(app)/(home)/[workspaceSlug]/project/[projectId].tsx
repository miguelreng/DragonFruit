import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Task01Icon } from "@/lib/icons";

import { EmptyState } from "@/components/empty-state";
import { IssueRow } from "@/components/issue-row";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getProjectIssues, type IssueListItem } from "@/lib/api";
import { colors } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

/** A project's landing screen: its work items. Reached by tapping a project
 *  anywhere (home cards, sidebar) — `openProject` routes here with the
 *  project's id + name. Tap a row to open the work item. */
export default function ProjectWorkItemsScreen() {
  const { workspaceSlug, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    projectId: string;
    name?: string;
  }>();
  const {
    data: issues,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<IssueListItem>(() => getProjectIssues(workspaceSlug, projectId), [workspaceSlug, projectId]);

  const openIssue = (issue: IssueListItem) =>
    router.push({
      pathname: "/[workspaceSlug]/issue/[issueId]",
      params: { workspaceSlug, issueId: issue.id, projectId: issue.project_id, name: issue.name },
    });

  return (
    <View style={styles.safe}>
      <ScreenHeader title={name ?? "Work items"} />

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
              icon={Task01Icon}
              title={error ? "Couldn't load work items" : "No work items yet"}
              body={error ? "Pull to retry." : "Work items created in this project will appear here."}
            />
          }
          renderItem={({ item }) => (
            <IssueRow issue={item} reference={`#${item.sequence_id}`} onPress={() => openIssue(item)} />
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
  listContentEmpty: { flexGrow: 1, paddingHorizontal: 20 },
});
