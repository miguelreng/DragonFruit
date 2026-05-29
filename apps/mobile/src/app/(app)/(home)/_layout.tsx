import { Stack } from "expo-router";

/** Drill-down stack living inside the drawer: workspaces → workspace → detail. */
export default function HomeStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
