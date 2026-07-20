import { StyleSheet, View } from "react-native";

import { MorphingInfinityLoader } from "@/components/morphing-infinity-loader";
import { colors } from "@/lib/theme";

/** Full-bleed web-parity loader used while the session rehydrates or a route gates. */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <MorphingInfinityLoader />
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
