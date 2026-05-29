import { router, useNavigation } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DrawerActions } from "@react-navigation/native";

import { getWorkspaces, type Workspace } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApiList } from "@/lib/use-api-list";

export default function WorkspacesScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useSession();
  const { data: workspaces, loading, refreshing, error, onRefresh } = useApiList<Workspace>(getWorkspaces, []);

  const greetingName = user?.display_name || user?.first_name || "there";

  const openWorkspace = (workspace: Workspace) =>
    router.push({ pathname: "/[workspaceSlug]", params: { workspaceSlug: workspace.slug, name: workspace.name } });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-4">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
          className="-ml-1 h-9 w-9 items-center justify-center rounded-lg active:opacity-60"
          accessibilityLabel="Open menu"
        >
          <Text className="text-xl text-ink">☰</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-sm text-muted">Welcome back,</Text>
          <Text className="text-xl text-ink font-semibold">{greetingName}</Text>
        </View>
        <Pressable onPress={() => void signOut()} className="rounded-lg px-3 py-1.5 active:opacity-70">
          <Text className="text-sm text-accent font-medium">Sign out</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={(workspace) => workspace.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e445a6" />}
          ListHeaderComponent={<Text className="text-xs text-muted mb-2 font-medium uppercase">Workspaces</Text>}
          ListEmptyComponent={
            <Text className="text-sm text-muted mt-10 text-center">
              {error ?? "You're not a member of any workspace yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openWorkspace(item)}
              className="mb-2 flex-row items-center gap-3 rounded-xl border border-black/5 bg-white p-4 active:opacity-70"
            >
              <View className="bg-accent/10 h-10 w-10 items-center justify-center rounded-lg">
                <Text className="text-base text-accent font-semibold">{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base text-ink font-medium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-xs text-muted">
                  {item.total_members} member{item.total_members === 1 ? "" : "s"}
                </Text>
              </View>
              <Text className="text-xl text-muted">›</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
