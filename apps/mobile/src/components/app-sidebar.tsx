import { router, useGlobalSearchParams, type Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/lib/session";

// Minimal structural type: expo-router's drawer passes a richer navigation
// object, but all the sidebar needs is to close the drawer after navigating.
type SidebarProps = { navigation: { closeDrawer: () => void } };

function SidebarItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mx-2 flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-black/5">
      <Text className="text-base w-5 text-center">{icon}</Text>
      <Text className="text-base text-ink">{label}</Text>
    </Pressable>
  );
}

/**
 * Drawer content — the slide-over sidebar. Mirrors the web rail: a workspace
 * switcher plus the current workspace's sections. It reads the active workspace
 * straight from the URL, so the in-workspace links only appear in context.
 */
export function AppSidebar({ navigation }: SidebarProps) {
  const { user, signOut } = useSession();
  const { workspaceSlug } = useGlobalSearchParams<{ workspaceSlug?: string }>();

  const navigate = (href: Href) => {
    navigation.closeDrawer();
    router.push(href);
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}>
        <View className="mb-2 px-4 pb-3">
          <Text className="text-lg text-ink font-semibold">DragonFruit</Text>
          {user ? (
            <Text className="text-xs text-muted" numberOfLines={1}>
              {user.display_name || user.email}
            </Text>
          ) : null}
        </View>

        <SidebarItem icon="🗂" label="Workspaces" onPress={() => navigate("/")} />

        {workspaceSlug ? (
          <View className="mt-2">
            <Text className="text-muted px-4 pt-2 pb-1 text-[11px] font-medium uppercase" numberOfLines={1}>
              {workspaceSlug}
            </Text>
            <SidebarItem
              icon="▦"
              label="Projects"
              onPress={() => navigate({ pathname: "/[workspaceSlug]", params: { workspaceSlug } })}
            />
            <SidebarItem
              icon="✓"
              label="My tasks"
              onPress={() => navigate({ pathname: "/[workspaceSlug]/my-tasks", params: { workspaceSlug } })}
            />
            <SidebarItem
              icon="📄"
              label="Docs"
              onPress={() => navigate({ pathname: "/[workspaceSlug]/docs", params: { workspaceSlug } })}
            />
          </View>
        ) : null}

        <View className="mt-3 border-t border-black/5 pt-2">
          <SidebarItem
            icon="⎋"
            label="Sign out"
            onPress={() => {
              navigation.closeDrawer();
              void signOut();
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
