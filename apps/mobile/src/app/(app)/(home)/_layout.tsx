import { Stack } from "expo-router";

import { motion } from "@/lib/motion";

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
    <Stack screenOptions={{ headerShown: false, animation: motion.stack.replace }}>
      {/* Ask Atlas is a full-screen chat pushed over the hub — from the tab-bar
          launcher (a slide-in you can swipe back from) and from the sidebar. It
          slides like a detail screen so entering the chat reads as a step in. */}
      <Stack.Screen name="[workspaceSlug]/atlas" options={{ animation: motion.stack.detail }} />
      <Stack.Screen name="[workspaceSlug]/project/[projectId]" options={{ animation: motion.stack.detail }} />
      <Stack.Screen name="[workspaceSlug]/issue/[issueId]" options={{ animation: motion.stack.detail }} />
      <Stack.Screen name="[workspaceSlug]/doc/[pageId]" options={{ animation: motion.stack.detail }} />
      <Stack.Screen
        name="[workspaceSlug]/new-task"
        options={{
          // Transparent modal so the form renders its own floating card over a
          // dimmed backdrop (see new-task.tsx) instead of an edge-docked sheet.
          presentation: "transparentModal",
          animation: motion.stack.modal,
        }}
      />
    </Stack>
  );
}
