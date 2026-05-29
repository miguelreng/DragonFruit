import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { getPages, type PageListItem } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";

export default function DocsScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const {
    data: pages,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<PageListItem>(() => getPages(workspaceSlug), [workspaceSlug]);

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
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Docs" subtitle="Pages in this workspace" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e445a6" />}
          ListEmptyComponent={
            <Text className="text-sm text-muted mt-10 text-center">{error ?? "No docs here yet."}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openDoc(item)}
              className="mb-2 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-base">{item.page_type === "whiteboard" ? "▦" : "📄"}</Text>
                <Text className="text-base text-ink flex-1 font-medium" numberOfLines={1}>
                  {item.name || "Untitled"}
                </Text>
              </View>
              {item.description_snippet ? (
                <Text className="text-xs text-muted mt-1 leading-4" numberOfLines={2}>
                  {item.description_snippet}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
