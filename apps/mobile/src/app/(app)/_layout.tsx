import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";

import { AppSidebar } from "@/components/app-sidebar";
import { LoadingScreen } from "@/components/loading-screen";
import { useCalendarWidgetSync } from "@/lib/use-calendar-widget-sync";
import { useSession } from "@/lib/session";

/**
 * Authenticated area. A slide-over drawer (the sidebar) wraps the drill-down
 * stack — swipe in from the left edge or tap the menu to open it. `drawerType:
 * "front"` overlays the content with a scrim instead of pushing it.
 */
export default function AppLayout() {
  const { isLoading, isAuthenticated } = useSession();

  // Keep the iOS calendar widget fresh whenever a signed-in session is active.
  useCalendarWidgetSync(isAuthenticated);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  return (
    <Drawer
      drawerContent={(props) => <AppSidebar navigation={props.navigation} />}
      screenOptions={{
        headerShown: false,
        drawerType: "front",
        drawerStyle: { width: "78%", maxWidth: 320 },
        swipeEdgeWidth: 48,
      }}
    />
  );
}
