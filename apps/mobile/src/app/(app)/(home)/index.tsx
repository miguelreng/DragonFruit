import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingScreen } from "@/components/loading-screen";
import { getWorkspaces, type Workspace } from "@/lib/api";
import { getLastWorkspaceSlug, setLastWorkspaceSlug } from "@/lib/secure-store";
import { useApiList } from "@/lib/use-api-list";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Landing route. The workspace switcher now lives in the sidebar, so on entry we
 * resolve the user's first workspace and drop them straight into it.
 */
export default function IndexRoute() {
  const { data: workspaces, loading, error } = useApiList<Workspace>(getWorkspaces, []);
  const [lastWorkspaceSlug, setLastWorkspace] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getLastWorkspaceSlug().then((slug) => {
      if (!cancelled) setLastWorkspace(slug);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWorkspace = workspaces.find((workspace) => workspace.slug === lastWorkspaceSlug) ?? workspaces[0];

  useEffect(() => {
    if (selectedWorkspace) void setLastWorkspaceSlug(selectedWorkspace.slug);
  }, [selectedWorkspace]);

  if (loading || lastWorkspaceSlug === undefined) return <LoadingScreen />;

  if (selectedWorkspace) {
    const ws = selectedWorkspace;
    return <Redirect href={{ pathname: "/[workspaceSlug]", params: { workspaceSlug: ws.slug, name: ws.name } }} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>No workspaces yet</Text>
        <Text style={styles.sub}>
          {error ?? "You're not a member of any workspace. Create one on the web to get started."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  title: { fontSize: font.size.lg, fontWeight: "600", color: colors.ink, marginBottom: spacing.sm },
  sub: { fontSize: font.size.sm, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
