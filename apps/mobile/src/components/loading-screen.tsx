import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/lib/theme";

/** Full-bleed spinner used while the session rehydrates or a route gates. */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
});
