import "react-native-gesture-handler";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/lib/session";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular: require("../../assets/fonts/Figtree-Regular.ttf"),
    Figtree_500Medium: require("../../assets/fonts/Figtree-Medium.ttf"),
    Figtree_600SemiBold: require("../../assets/fonts/Figtree-SemiBold.ttf"),
    Figtree_700Bold: require("../../assets/fonts/Figtree-Bold.ttf"),
    Figtree_400Italic: require("../../assets/fonts/Figtree-Italic.ttf"),
    Figtree_500MediumItalic: require("../../assets/fonts/Figtree-MediumItalic.ttf"),
    Figtree_600SemiBoldItalic: require("../../assets/fonts/Figtree-SemiBoldItalic.ttf"),
    Figtree_700BoldItalic: require("../../assets/fonts/Figtree-BoldItalic.ttf"),
    // Serif for the home greeting — ORIGINAL Newsreader ttf (internal family
    // "Newsreader"). iOS resolves fontFamily by the internal name, and only the
    // UNMODIFIED files register reliably (fonttools-rewritten copies were rejected
    // by iOS), so it's referenced as fontFamily "Newsreader" + fontStyle "italic".
    Newsreader_400Regular: require("../../assets/fonts/Newsreader-Regular.ttf"),
    Newsreader_400Regular_Italic: require("../../assets/fonts/Newsreader-Italic.ttf"),
    Newsreader_600SemiBold: require("../../assets/fonts/Newsreader-SemiBold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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
