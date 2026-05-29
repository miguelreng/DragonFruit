import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/lib/session";

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
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center px-8">
        <View className="bg-accent mb-4 h-16 w-16 items-center justify-center rounded-2xl">
          <Text className="text-3xl">🐉</Text>
        </View>
        <Text className="text-2xl text-ink font-semibold">DragonFruit</Text>
        <Text className="text-base text-muted mt-2 text-center">Your workspace, in your pocket.</Text>

        <Pressable
          onPress={onPress}
          disabled={submitting}
          className="bg-accent mt-10 w-full items-center rounded-xl py-3.5 active:opacity-80 disabled:opacity-60"
        >
          <Text className="text-base font-semibold text-white">{submitting ? "Opening sign-in…" : "Sign in"}</Text>
        </Pressable>

        {error ? <Text className="text-sm text-red-600 mt-4 text-center">{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
