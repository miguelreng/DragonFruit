import { useLocalSearchParams } from "expo-router";

import { WorkspaceHub } from "@/components/workspace-hub";

export default function WorkspaceHomeScreen() {
  const { workspaceSlug, tab } = useLocalSearchParams<{ workspaceSlug: string; tab?: string }>();
  const initialTab =
    tab === "stickies" || tab === "docs" || tab === "tasks" || tab === "account" ? tab : "voice";
  return <WorkspaceHub workspaceSlug={workspaceSlug} initialTab={initialTab} />;
}
