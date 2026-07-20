import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

function safelyTrigger(feedback: () => Promise<void>) {
  void feedback().catch(() => {
    // Haptics are enhancement-only and must never block the interaction.
  });
}

/** A quiet tick for moving between discrete choices, such as app tabs. */
export function selectionHaptic() {
  if (Platform.OS === "web") return;
  safelyTrigger(() =>
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      : Haptics.selectionAsync()
  );
}

/** A light confirmation for meaningful commits such as Send or Create. */
export function commitHaptic() {
  if (Platform.OS === "web") return;
  safelyTrigger(() =>
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  );
}
