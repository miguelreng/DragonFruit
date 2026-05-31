import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function SignInScreen() {
  const { signIn } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setSubmitting(true);
    setError(null);
    const result = await signIn();
    if (!result.ok && result.reason !== "cancelled") {
      setError(
        result.reason === "no-token"
          ? "We couldn't complete sign-in. Please try again."
          : (result.message ?? "Something went wrong. Please try again.")
      );
    }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🐉</Text>
        </View>

        <Text style={styles.title}>DragonFruit</Text>
        <Text style={styles.subtitle}>Your workspace, in your pocket.</Text>

        <Pressable
          onPress={onPress}
          disabled={submitting}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, submitting && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{submitting ? "Opening sign-in…" : "Sign in"}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    height: 72,
    width: 72,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoEmoji: {
    fontSize: 34,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
  },
  button: {
    marginTop: 40,
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
  error: {
    fontSize: 14,
    color: colors.danger,
    marginTop: 16,
    textAlign: "center",
  },
});
