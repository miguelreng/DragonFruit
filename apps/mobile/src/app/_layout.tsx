import "../global.css";
import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(auth)" />
          </Stack>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
