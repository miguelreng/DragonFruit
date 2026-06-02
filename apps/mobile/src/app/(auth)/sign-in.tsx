import { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { DragonMark } from "@/components/dragon-mark";
import { useSession } from "@/lib/session";
import { colors, shadow } from "@/lib/theme";

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
    <View style={styles.safe}>
      <View style={styles.imageHalf}>
        <Image
          source={require("../../../assets/images/login-header.png")}
          style={styles.headerImage}
          resizeMode="cover"
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            "rgba(244,245,245,0)",
            "rgba(244,245,245,0.35)",
            "rgba(244,245,245,0.75)",
            "rgba(244,245,245,0.95)",
            colors.canvas,
          ]}
          locations={[0, 0.45, 0.72, 0.9, 1]}
          style={styles.blend}
        />
      </View>

      <SafeAreaView style={styles.formHalf} edges={["bottom"]}>
        <View style={styles.container}>
          <DragonMark width={52} color={colors.ink} />

          <Text style={styles.headline}>
            <Text style={styles.headlineBold}>Where </Text>
            <Text style={styles.headlineItalic}>ideas </Text>
            <Text style={styles.headlineBold}>become </Text>
            <Text style={styles.headlineItalic}>work</Text>
            <Text style={styles.headlineBold}>.</Text>
          </Text>
          <Text style={styles.subtitle}>Welcome back to DragonFruit.</Text>

          <Pressable
            onPress={onPress}
            disabled={submitting}
            style={[styles.button, submitting && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{submitting ? "Opening sign-in…" : "Sign in"}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.legal}>
            By signing in, you agree to our{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://dragonfruit.sh/legal/terms")}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://dragonfruit.sh/legal/privacy")}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  imageHalf: {
    flex: 3,
    backgroundColor: colors.brand,
    overflow: "hidden",
  },
  headerImage: {
    // Slightly wider than the frame and centered, then nudged right — the extra
    // width keeps the left edge covered while the image pans toward the right.
    width: "116%",
    height: "100%",
    marginLeft: "-8%",
    transform: [{ translateX: 28 }],
  },
  blend: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
  },
  formHalf: {
    flex: 2,
    backgroundColor: colors.canvas,
  },
  container: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  headline: {
    marginTop: 28,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  headlineBold: {
    fontSize: 28,
    fontFamily: "Figtree_700Bold",
    color: colors.ink,
  },
  headlineItalic: {
    fontSize: 30,
    fontFamily: "Newsreader",
    fontStyle: "italic",
    color: colors.ink,
  },
  subtitle: {
    fontSize: 18,
    color: colors.muted,
    fontFamily: "Figtree_500Medium",
    marginTop: 12,
  },
  button: {
    marginTop: 40,
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.button,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Figtree_600SemiBold",
    color: colors.white,
  },
  error: {
    fontSize: 14,
    color: colors.danger,
    fontFamily: "Figtree_500Medium",
    marginTop: 16,
    textAlign: "center",
  },
  legal: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    fontFamily: "Figtree_400Regular",
  },
  legalLink: {
    color: colors.muted,
    fontFamily: "Figtree_600SemiBold",
  },
});
