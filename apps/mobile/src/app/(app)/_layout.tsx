import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useWindowDimensions, View } from "react-native";

import { AppSidebar } from "@/components/app-sidebar";
import { LoadingScreen } from "@/components/loading-screen";
import { useCalendarWidgetSync } from "@/lib/use-calendar-widget-sync";
import { useSession } from "@/lib/session";
import { radius } from "@/lib/theme";

/**
 * Authenticated area. An overlay drawer (the sidebar) wraps the stack — swipe
 * in from the left edge or tap the menu to open it. `drawerType: "front"` slides
 * the sidebar over the top of the current screen, which stays put underneath a
 * dim scrim, so opening it feels like the sidebar is superimposed on the content
 * rather than pushing the whole surface sideways.
 */
export default function AppLayout() {
  const { isLoading, isAuthenticated } = useSession();
  const { width } = useWindowDimensions();

  // Keep the iOS calendar widget fresh whenever a signed-in session is active.
  useCalendarWidgetSync(isAuthenticated);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  // Numeric width (not a "%" string): the drawer view is absolutely positioned
  // and animated, and a percentage there fails Yoga's child layout under the
  // New Architecture — the sidebar's flex rows collapse to columns. A concrete
  // pixel width resolves cleanly and also matches the slide transform offset.
  // A standard drawer width (not full screen) leaves a dim scrim strip on the
  // right to tap-close; the sidebar's rows fill this width.
  const drawerWidth = Math.round(width * 0.86);

  return (
    <Drawer
      defaultStatus="open"
      // Wrap in a flex:1 View: react-native-drawer-layout renders this content
      // as the direct child of an absolutely-positioned animated view, where (on
      // the New Architecture) descendant `flexDirection: "row"` collapses to a
      // column. The scene side gets such a wrapper internally; the drawer side
      // doesn't, so we add our own to restore a normal flex context.
      drawerContent={(props) => (
        <View style={{ flex: 1 }}>
          <AppSidebar navigation={props.navigation} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        // Overlay the sidebar on top of the screen (it stays put) instead of
        // sliding the whole surface sideways.
        drawerType: "front",
        // Solid subtle-gray panel (matches the sidebar background in
        // app-sidebar.tsx) so it slides as one opaque surface.
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: "#f4f5f5",
          // Round the panel's right edge (top + bottom corners).
          borderTopRightRadius: radius.lg,
          borderBottomRightRadius: radius.lg,
        },
        // Dim scrim over the covered content; tap it to close.
        overlayColor: "rgba(0,0,0,0.4)",
        swipeEdgeWidth: 48,
      }}
    />
  );
}
