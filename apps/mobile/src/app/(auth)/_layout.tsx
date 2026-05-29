import { Redirect, Stack } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useSession } from "@/lib/session";

/** Sign-in area — if already authenticated, send the user into the app. */
export default function AuthLayout() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
