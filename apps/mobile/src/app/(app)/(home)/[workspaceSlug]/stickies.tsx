import { Redirect, useLocalSearchParams } from "expo-router";

/** Keep existing sticky deep links pointed at the new focused workspace shell. */
export default function StickiesRedirect() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  return <Redirect href={{ pathname: "/[workspaceSlug]", params: { workspaceSlug, tab: "stickies" } }} />;
}
