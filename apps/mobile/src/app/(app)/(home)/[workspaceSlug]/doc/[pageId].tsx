import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { DocWebView } from "@/components/doc-web-view";
import { ScreenHeader } from "@/components/screen-header";
import { getPage, isAuthError, type PageDetail } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function DocScreen() {
  const { workspaceSlug, pageId, projectId, name, pageType } = useLocalSearchParams<{
    workspaceSlug: string;
    pageId: string;
    projectId?: string;
    name?: string;
    pageType?: string;
  }>();
  const { signOut } = useSession();

  const [page, setPage] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // The single-page endpoint is project-scoped; workspace-level pages can't
    // be fetched this way, so steer the user to web for those.
    if (!projectId) {
      setError("This page lives outside a project — open it on web to read it.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setPage(await getPage(workspaceSlug, projectId, pageId));
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load this doc.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId, pageId, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const isWhiteboard = (page?.page_type ?? pageType) === "whiteboard";
  const html = page?.description_html?.trim() ?? "";

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={name || "Doc"} subtitle="Read-only" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e445a6" />
        </View>
      ) : error ? (
        <Text className="text-sm text-muted mt-10 px-6 text-center">{error}</Text>
      ) : isWhiteboard ? (
        <Text className="text-sm text-muted mt-10 px-6 text-center">
          This is a whiteboard. Open it on web to view the canvas.
        </Text>
      ) : html ? (
        <DocWebView html={html} />
      ) : (
        <Text className="text-sm text-muted mt-10 px-6 text-center">This page is empty.</Text>
      )}
    </View>
  );
}
