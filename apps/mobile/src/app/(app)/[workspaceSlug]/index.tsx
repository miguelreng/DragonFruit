import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { getProjects, type Project } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";

export default function ProjectsScreen() {
  const { workspaceSlug, name } = useLocalSearchParams<{ workspaceSlug: string; name?: string }>();
  const {
    data: projects,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<Project>(() => getProjects(workspaceSlug), [workspaceSlug]);

  const openProject = (project: Project) =>
    router.push({
      pathname: "/[workspaceSlug]/project/[projectId]",
      params: { workspaceSlug, projectId: project.id, name: project.name },
    });

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={name ?? "Projects"} subtitle={name ? "Projects" : undefined} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(project) => project.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e445a6" />}
          ListHeaderComponent={
            <View>
              <Pressable
                onPress={() => router.push({ pathname: "/[workspaceSlug]/my-tasks", params: { workspaceSlug } })}
                className="mb-4 flex-row items-center gap-3 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
              >
                <View className="bg-accent/10 h-10 w-10 items-center justify-center rounded-lg">
                  <Text className="text-base text-accent font-semibold">✓</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base text-ink font-medium">My tasks</Text>
                  <Text className="text-xs text-muted">Work assigned to you</Text>
                </View>
                <Text className="text-xl text-muted">›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: "/[workspaceSlug]/docs", params: { workspaceSlug } })}
                className="mb-4 flex-row items-center gap-3 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
              >
                <View className="bg-accent/10 h-10 w-10 items-center justify-center rounded-lg">
                  <Text className="text-base">📄</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base text-ink font-medium">Docs</Text>
                  <Text className="text-xs text-muted">Pages in this workspace</Text>
                </View>
                <Text className="text-xl text-muted">›</Text>
              </Pressable>
              <Text className="text-xs text-muted mb-2 font-medium uppercase">Projects</Text>
            </View>
          }
          ListEmptyComponent={
            <Text className="text-sm text-muted mt-10 text-center">{error ?? "No projects here yet."}</Text>
          }
          renderItem={({ item }) => {
            const memberCount = item.members?.length ?? 0;
            return (
              <Pressable
                onPress={() => openProject(item)}
                className="mb-2 flex-row items-center gap-3 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
              >
                <View className="bg-accent/10 h-10 w-10 items-center justify-center rounded-lg">
                  <Text className="text-xs text-accent font-bold">
                    {(item.identifier || item.name).slice(0, 3).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base text-ink font-medium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {item.network === 2 ? "Public" : "Private"} · {memberCount} member{memberCount === 1 ? "" : "s"}
                  </Text>
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
