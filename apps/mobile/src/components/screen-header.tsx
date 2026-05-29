import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Lightweight back-header for pushed browse screens. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} className="bg-canvas">
      <View className="flex-row items-center gap-1 px-3 pt-1 pb-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-lg active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-3xl text-accent leading-none">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg text-ink font-semibold" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
