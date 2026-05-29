import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { getUpcomingMeetings } from "@/lib/api";

// Must match app.json `ios.entitlements` and the widget's expo-target.config.js.
const APP_GROUP = "group.sh.dragonfruit.mobile";
const EVENTS_KEY = "calendar_events";
const REFRESH_TASK = "dragonfruit-calendar-widget-refresh";

// The widget needs an App Group, which requires a paid Apple Developer account.
// Free / Personal-Team builds leave it off so signing won't fail. Flip
// EXPO_PUBLIC_WIDGET_ENABLED=1 (and rebuild) once on the paid program. Must
// match the gate in app.config.js.
const WIDGET_ENABLED = process.env.EXPO_PUBLIC_WIDGET_ENABLED === "1";

const storage = Platform.OS === "ios" && WIDGET_ENABLED ? new ExtensionStorage(APP_GROUP) : null;

/** Fetch upcoming events and push a compact snapshot into the widget's App
 *  Group, then ask WidgetKit to reload. Best-effort and silent. */
export async function syncCalendarWidget(): Promise<void> {
  if (Platform.OS !== "ios" || !storage) return;
  try {
    const events = await getUpcomingMeetings();
    const payload = {
      updatedAt: new Date().toISOString(),
      events: events.slice(0, 10).map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.all_day,
        location: event.location,
      })),
    };
    storage.set(EVENTS_KEY, JSON.stringify(payload));
    ExtensionStorage.reloadWidget();
  } catch {
    // Never let widget sync surface an error in the app.
  }
}

/** Wipe the snapshot on sign-out so the widget doesn't show a stale calendar. */
export function clearCalendarWidget(): void {
  if (Platform.OS !== "ios" || !storage) return;
  storage.remove(EVENTS_KEY);
  ExtensionStorage.reloadWidget();
}

// Defined at module load so iOS can invoke it on a cold background launch.
// (This module is imported by the session layer, which always loads at start.)
if (WIDGET_ENABLED && Platform.OS === "ios") {
  TaskManager.defineTask(REFRESH_TASK, async () => {
    await syncCalendarWidget();
    return BackgroundTask.BackgroundTaskResult.Success;
  });
}

/** Register the periodic background refresh (~every 30 min, OS-throttled). */
export async function registerCalendarBackgroundRefresh(): Promise<void> {
  if (Platform.OS !== "ios" || !WIDGET_ENABLED) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(REFRESH_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 30 });
    }
  } catch {
    // Background execution may be unavailable (e.g. on the simulator).
  }
}
