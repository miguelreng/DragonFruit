import { Stack } from "expo-router";

/**
 * Stack living inside the drawer. The top-level workspace views (home, docs,
 * tasks, calendar, …) are siblings reached from the sidebar, not a drill-down:
 * the sidebar `router.replace`s between them so no back-stack builds up, and
 * with `animation: "none"` they simply swap in place behind the closing drawer
 * — switching feels like picking a destination, and the left-edge swipe always
 * opens the sidebar (there's nothing for the stack to pop). Genuine detail
 * screens (project / issue / doc) are still pushed, so they keep the native iOS
 * slide and the back gesture. The new-task form is presented as a form sheet —
 * a bottom drawer that slides up over the current screen and swipes down to
 * dismiss, leaving the home visible behind it.
 */
export default function HomeStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      {/* Ask Atlas peeks in from the home right edge as an in-place slide-over
          (see `AtlasPeek`), so it isn't a stack screen — only the sidebar's
          top-level `atlas` destination is. */}
      <Stack.Screen name="[workspaceSlug]/project/[projectId]" options={{ animation: "default" }} />
      <Stack.Screen name="[workspaceSlug]/issue/[issueId]" options={{ animation: "default" }} />
      <Stack.Screen name="[workspaceSlug]/doc/[pageId]" options={{ animation: "default" }} />
      <Stack.Screen
        name="[workspaceSlug]/new-task"
        options={{
          // Transparent modal so the form renders its own floating card over a
          // dimmed backdrop (see new-task.tsx) instead of an edge-docked sheet.
          presentation: "transparentModal",
          animation: "fade",
        }}
      />
    </Stack>
  );
}
