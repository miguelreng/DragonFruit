import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { GlobeIcon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { DocWebView } from "@/components/doc-web-view";
import { ScreenHeader } from "@/components/screen-header";
import { getPage, isAuthError, type PageDetail } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { useSession } from "@/lib/session";
import { colors, font, radius, spacing } from "@/lib/theme";

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

  const webUrl = projectId
    ? `/${workspaceSlug}/projects/${projectId}/pages/${pageId}`
    : `/${workspaceSlug}/pages/${pageId}`;

  return (
    <View style={styles.safe}>
      <ScreenHeader title={name || "Doc"} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <WebFallback message={error} onOpen={() => openWeb(webUrl)} />
      ) : isWhiteboard ? (
        <WebFallback message="This is a whiteboard. Open it on web to view the canvas." onOpen={() => openWeb(webUrl)} />
      ) : html ? (
        <DocWebView html={html} fontStyle={page?.view_props?.font_style} />
      ) : (
        <Text style={styles.message}>This page is empty.</Text>
      )}
    </View>
  );
}

function WebFallback({ message, onOpen }: { message: string; onOpen: () => void }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.message}>{message}</Text>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open on web">
        {({ pressed }) => (
          <View style={[styles.webBtn, pressed && styles.webBtnPressed]}>
            <AppIcon icon={GlobeIcon} size={18} color={colors.white} strokeWidth={1.9} />
            <Text style={styles.webBtnText}>Open on web</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  message: {
    textAlign: "center",
    color: colors.muted,
    fontSize: font.size.sm,
    lineHeight: 21,
    fontFamily: "Figtree_400Regular",
  },
  webBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  webBtnPressed: { backgroundColor: colors.accentPrimaryHover },
  webBtnText: { fontSize: font.size.sm, color: colors.white, fontFamily: "Figtree_600SemiBold" },
});
