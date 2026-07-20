import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { TasksList } from "@/components/tasks-list";
import { colors } from "@/lib/theme";

export default function MyTasksScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();

  return (
    <View style={styles.safe}>
      <ScreenHeader title="My tasks" />
      <TasksList workspaceSlug={workspaceSlug} showTitle={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
});
