import { useEffect } from "react";
import { AppState } from "react-native";

import { registerCalendarBackgroundRefresh, syncCalendarWidget } from "@/lib/calendar-widget";

/**
 * Keeps the iOS calendar widget fresh while signed in: syncs on mount, on every
 * return to the foreground, and registers the periodic background refresh.
 * No-op off iOS / when disabled.
 */
export function useCalendarWidgetSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void syncCalendarWidget();
    void registerCalendarBackgroundRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncCalendarWidget();
    });
    return () => subscription.remove();
  }, [enabled]);
}
