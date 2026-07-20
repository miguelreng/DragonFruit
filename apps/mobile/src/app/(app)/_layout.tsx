import { Redirect, Stack } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useCalendarWidgetSync } from "@/lib/use-calendar-widget-sync";
import { useSession } from "@/lib/session";

/**
 * The authenticated mobile app is intentionally a focused three-surface shell:
 * voice capture, stickies, and docs. Legacy routes remain available for existing deep
 * links, but the drawer and its broad navigation are no longer part of the
 * primary experience.
 */
export default function AppLayout() {
  const { isLoading, isAuthenticated } = useSession();

  useCalendarWidgetSync(isAuthenticated);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;
}
