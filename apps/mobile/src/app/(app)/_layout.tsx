import { Redirect, Stack } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useCalendarWidgetSync } from "@/lib/use-calendar-widget-sync";
import { useSession } from "@/lib/session";

/** Authenticated area — bounce to sign-in if there's no valid session. */
export default function AppLayout() {
  const { isLoading, isAuthenticated } = useSession();

  // Keep the iOS calendar widget fresh whenever a signed-in session is active.
  useCalendarWidgetSync(isAuthenticated);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
