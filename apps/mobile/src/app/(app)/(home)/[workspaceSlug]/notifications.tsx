import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import {
  getNotifications,
  isAuthError,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/api";
import { stripHtml, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

function primaryText(n: Notification): string {
  const msg = n.message_html ? stripHtml(n.message_html) : "";
  return msg || n.title || n.data?.issue?.name || "Notification";
}

export default function NotificationsScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { signOut } = useSession();

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getNotifications(workspaceSlug));
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError("Couldn't load notifications. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceSlug, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const openNotification = (n: Notification) => {
    // Optimistically mark read, then open the related issue when we can.
    if (!n.read_at) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)));
      void markNotificationRead(workspaceSlug, n.id).catch(() => {});
    }
    if (n.project && n.entity_identifier) {
      router.push({
        pathname: "/[workspaceSlug]/issue/[issueId]",
        params: {
          workspaceSlug,
          issueId: n.entity_identifier,
          projectId: n.project,
          name: n.data?.issue?.name ?? "Work item",
        },
      });
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? new Date().toISOString() })));
    try {
      await markAllNotificationsRead(workspaceSlug);
    } catch {
      void load();
    }
  };

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Notifications" />

      {unreadCount > 0 ? (
        <Pressable
          onPress={() => void markAll()}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          style={({ pressed }) => [styles.markAll, pressed && styles.markAllPressed]}
        >
          <Text style={styles.markAllText}>Mark all as read</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={<Text style={styles.empty}>{error ?? "No notifications yet."}</Text>}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            const who = item.triggered_by_details?.display_name;
            const meta = [item.data?.issue?.name, item.created_at ? timeAgo(item.created_at) : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable onPress={() => openNotification(item)} accessibilityRole="button">
                {({ pressed }) => (
                  <View style={[styles.card, unread && styles.cardUnread, pressed && styles.cardPressed]}>
                    {unread ? <View style={styles.unreadDot} /> : <View style={styles.unreadDotSpacer} />}
                    <View style={styles.body}>
                      <Text style={styles.text} numberOfLines={3}>
                        {who ? <Text style={styles.who}>{who} </Text> : null}
                        {primaryText(item)}
                      </Text>
                      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                    </View>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
        </ScrollFade>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  markAll: { alignSelf: "flex-end", marginRight: 20, marginBottom: spacing.xs, paddingVertical: 6, paddingHorizontal: spacing.sm },
  markAllPressed: { opacity: 0.6 },
  markAllText: { fontSize: font.size.sm, color: colors.brandText, fontFamily: "Figtree_600SemiBold" },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  empty: { marginTop: 40, textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  card: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.card,
  },
  cardUnread: { borderColor: colors.brandSoft, backgroundColor: colors.accentSubtle },
  cardPressed: { backgroundColor: colors.layerTransparentHover },
  unreadDot: { marginTop: 5, height: 8, width: 8, borderRadius: 999, backgroundColor: colors.brand },
  unreadDotSpacer: { width: 8 },
  body: { flex: 1 },
  text: { fontSize: font.size.sm, lineHeight: 20, color: colors.ink, fontFamily: "Figtree_400Regular" },
  who: { fontFamily: "Figtree_600SemiBold", color: colors.ink },
  meta: { marginTop: 3, fontSize: font.size.xs, color: colors.muted, fontFamily: "Figtree_400Regular" },
});
