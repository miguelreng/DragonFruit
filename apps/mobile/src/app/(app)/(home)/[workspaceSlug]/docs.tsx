import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { DocsDirectory } from "@/components/docs-directory";
import { ScreenHeader } from "@/components/screen-header";
import { colors } from "@/lib/theme";

export default function DocsScreen() {
  const { workspaceSlug, projectId, name } = useLocalSearchParams<{
    workspaceSlug: string;
    projectId?: string;
    name?: string;
  }>();

  return (
    <View style={styles.safe}>
      <ScreenHeader title={projectId ? (name ?? "Docs") : "Docs"} />
      <DocsDirectory key={`${workspaceSlug}:${projectId ?? ""}`} workspaceSlug={workspaceSlug} projectId={projectId} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
});
