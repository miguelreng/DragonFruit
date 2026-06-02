import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { IconSvgElement } from "@hugeicons/react-native";
import {
  ArrowUpRight01Icon,
  CodeIcon,
  FigmaIcon,
  File02Icon,
  Github01Icon,
  Globe02Icon,
  Image02Icon,
  MusicNote01Icon,
  News01Icon,
  Pdf01Icon,
  PlayCircle02Icon,
  ShoppingBag03Icon,
  NewTwitterIcon,
} from "@hugeicons/core-free-icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getBookmarks, type Bookmark } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? url;
}

/** Google's favicon service returns a crisp icon for any domain, with no backend work. */
function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

// ---------------------------------------------------------------------------
// Bookmark types — classify a link by its URL so each kind gets a recognizable
// icon + accent. The icon doubles as the placeholder when no thumbnail/favicon
// is available, and as the always-visible type glyph beside the host.
// ---------------------------------------------------------------------------

type BookmarkType = {
  key: string;
  label: string;
  icon: IconSvgElement;
  tint: string;
};

const TYPES = {
  image: { key: "image", label: "Image", icon: Image02Icon, tint: "#7c3aed" },
  video: { key: "video", label: "Video", icon: PlayCircle02Icon, tint: "#dc2626" },
  audio: { key: "audio", label: "Audio", icon: MusicNote01Icon, tint: "#16a34a" },
  pdf: { key: "pdf", label: "PDF", icon: Pdf01Icon, tint: "#dc2626" },
  doc: { key: "doc", label: "Document", icon: File02Icon, tint: "#4f46e5" },
  code: { key: "code", label: "Code", icon: Github01Icon, tint: "#1d1f20" },
  repo: { key: "repo", label: "Repository", icon: CodeIcon, tint: "#1d1f20" },
  design: { key: "design", label: "Design", icon: FigmaIcon, tint: "#ea580c" },
  shop: { key: "shop", label: "Shopping", icon: ShoppingBag03Icon, tint: "#d97706" },
  social: { key: "social", label: "Post", icon: NewTwitterIcon, tint: "#1d9bf0" },
  news: { key: "news", label: "Article", icon: News01Icon, tint: "#0d9488" },
  link: { key: "link", label: "Link", icon: Globe02Icon, tint: colors.brand },
} satisfies Record<string, BookmarkType>;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|m4a)(\?|#|$)/i;

function classify(url: string, title?: string): BookmarkType {
  const u = (url || "").toLowerCase();
  const host = hostOf(u);

  if (IMAGE_EXT.test(u)) return TYPES.image;
  if (VIDEO_EXT.test(u) || /youtube\.com|youtu\.be|vimeo\.com|twitch\.tv/.test(host)) return TYPES.video;
  if (AUDIO_EXT.test(u) || /spotify\.com|soundcloud\.com|music\.apple\.com/.test(host)) return TYPES.audio;
  if (/\.pdf(\?|#|$)/i.test(u)) return TYPES.pdf;
  if (/figma\.com/.test(host)) return TYPES.design;
  if (/github\.com|gitlab\.com|bitbucket\.org/.test(host)) return TYPES.code;
  if (/(^|\.)npmjs\.com|stackoverflow\.com|codepen\.io|codesandbox\.io/.test(host)) return TYPES.repo;
  if (/docs\.google\.com|notion\.so|\.docx?(\?|#|$)|\.pptx?(\?|#|$)|readme/.test(u)) return TYPES.doc;
  if (/amazon\.|etsy\.com|ebay\.|shopify\.|\/product/.test(u)) return TYPES.shop;
  if (/twitter\.com|x\.com|threads\.net|bsky\.app|mastodon/.test(host)) return TYPES.social;
  if (/medium\.com|substack\.com|\/blog|\/article|news/.test(u) || /news/.test(title?.toLowerCase() ?? "")) return TYPES.news;
  return TYPES.link;
}

/**
 * Visual preview for a bookmark.
 *
 * - Picture-type bookmarks render the actual image as a thumbnail.
 * - Everything else shows the site favicon.
 * - When neither is available, we fall back to the bookmark type's icon on a
 *   tinted tile, so the slot is never blank and the kind stays readable.
 */
function BookmarkPreview({ url, type }: { url: string; type: BookmarkType }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  const isImage = type.key === "image";
  const source = isImage ? url : faviconUrl(host);

  if (failed) {
    return (
      <View style={styles.preview}>
        <AppIcon icon={type.icon} size={24} color={colors.faint} strokeWidth={1.9} />
      </View>
    );
  }

  return (
    <View style={[styles.preview, isImage && styles.previewImage]}>
      <Image
        source={{ uri: source }}
        onError={() => setFailed(true)}
        style={isImage ? styles.thumb : styles.favicon}
        contentFit={isImage ? "cover" : "contain"}
        cachePolicy="memory-disk"
        transition={150}
      />
    </View>
  );
}

function BookmarkCard({ item }: { item: Bookmark }) {
  const host = hostOf(item.url);
  const type = classify(item.url, item.title);
  return (
    <Pressable
      onPress={() => item.url && openWeb(item.url)}
      accessibilityRole="link"
      accessibilityLabel={`${type.label}: ${item.title || item.url}`}
    >
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.cardPressed]}>
          <BookmarkPreview url={item.url} type={type} />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title || host}
            </Text>
            <View style={styles.hostRow}>
              <AppIcon icon={type.icon} size={12} color={colors.faint} strokeWidth={2} />
              <Text style={styles.host} numberOfLines={1}>
                {host}
              </Text>
            </View>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <View style={styles.openAffordance}>
            <AppIcon icon={ArrowUpRight01Icon} size={15} color={colors.faint} strokeWidth={2} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function BookmarksScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { data: bookmarks, loading, refreshing, error, onRefresh } = useApiList<Bookmark>(
    () => getBookmarks(workspaceSlug),
    [workspaceSlug]
  );

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Bookmarks" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
        <FlatList
          data={bookmarks}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={<Text style={styles.empty}>{error ?? "No bookmarks yet."}</Text>}
          renderItem={({ item }) => <BookmarkCard item={item} />}
        />
        </ScrollFade>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  empty: { marginTop: 40, textAlign: "center", fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  card: {
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadow.card,
  },
  cardPressed: { backgroundColor: colors.layerTransparentHover },
  preview: {
    height: 52,
    width: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.layer1,
  },
  previewImage: { backgroundColor: colors.layer1 },
  favicon: { height: 28, width: 28 },
  thumb: { height: "100%", width: "100%" },
  body: { flex: 1, paddingTop: 1 },
  title: { fontSize: font.size.md, lineHeight: 21, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  hostRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  host: { flex: 1, fontSize: font.size.xs, color: colors.brandText, fontFamily: "Figtree_500Medium" },
  desc: { marginTop: 5, fontSize: font.size.xs, lineHeight: 17, color: colors.muted, fontFamily: "Figtree_400Regular" },
  openAffordance: {
    height: 26,
    width: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.layer1,
    alignItems: "center",
    justifyContent: "center",
  },
});
