import { ActivityIndicator, View } from "react-native";

/** Full-bleed spinner used while the session rehydrates or a route gates. */
export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color="#e445a6" />
    </View>
  );
}
