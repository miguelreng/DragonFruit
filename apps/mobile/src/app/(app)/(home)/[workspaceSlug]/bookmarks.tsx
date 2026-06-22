import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image, type ImageLoadEventData } from "expo-image";
import type { AppIconComponent } from "@/lib/icons";
import {
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
} from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { getBookmarks, type Bookmark } from "@/lib/api";
import { openWeb } from "@/lib/open-web";
import { colors, font, radius, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

function hostOf(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] ?? url
  );
}

// ---------------------------------------------------------------------------
// Bookmark types — classify a link by its URL so each kind gets a recognizable
// icon + accent. Used as the glyph on text tiles (bookmarks with no preview).
// ---------------------------------------------------------------------------

type BookmarkType = {
  key: string;
  label: string;
  icon: AppIconComponent;
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
  if (/medium\.com|substack\.com|\/blog|\/article|news/.test(u) || /news/.test(title?.toLowerCase() ?? ""))
    return TYPES.news;
  return TYPES.link;
}

// ---------------------------------------------------------------------------
// Preview helpers — mirror the web board: use the captured OG image, respect
// the image's real aspect ratio (from stored dims, else measured on load), and
// hide filename-style titles since the image is the content.
// ---------------------------------------------------------------------------

const DEFAULT_RATIO = 0.8; // width / height — portrait placeholder (like web's 4:5)

function previewImage(b: Bookmark): string {
  const md = b.metadata ?? {};
  if (md.image_url) return md.image_url;
  if (md.og_image_url) return md.og_image_url;
  if (IMAGE_EXT.test(b.url || "")) return b.url;
  return "";
}

function knownRatio(b: Bookmark): number | undefined {
  const w = Number(b.metadata?.image_width);
  const h = Number(b.metadata?.image_height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : undefined;
}

const MEDIA_FILE_TITLE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|tiff?|avif|mp4|mov|webm|pdf)$/i;

function isJunkTitle(raw?: string): boolean {
  const title = (raw ?? "").trim();
  if (!title) return true;
  if (MEDIA_FILE_TITLE.test(title)) return true;
  const tokens = title.split(/[\s._-]+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const idLike = tokens.filter((t) => /^\d{4,}$/.test(t) || /^[0-9a-f]{8,}$/i.test(t) || /^[a-z]$/i.test(t));
  return idLike.length / tokens.length >= 0.7;
}

function displayTitle(b: Bookmark): string {
  return isJunkTitle(b.title) ? "" : b.title.trim();
}

/** Image preview that holds its ratio: known dims reserve space up front (no
 *  reflow); unknown dims show a neutral box, then lock to the measured ratio. */
function PreviewImage({ uri, knownAr }: { uri: string; knownAr?: number }) {
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const aspectRatio = knownAr ?? measured ?? DEFAULT_RATIO;
  return (
    <Image
      source={{ uri }}
      style={[styles.cardImage, { aspectRatio }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
      onLoad={
        knownAr
          ? undefined
          : (event: ImageLoadEventData) => {
              const { width, height } = event.source ?? {};
              if (width && height) setMeasured(width / height);
            }
      }
    />
  );
}

function MasonryCard({ item }: { item: Bookmark }) {
  const host = hostOf(item.url);
  const type = classify(item.url, item.title);
  const image = previewImage(item);
  const title = displayTitle(item);

  return (
    <Pressable
      onPress={() => item.url && openWeb(item.url)}
      accessibilityRole="link"
      accessibilityLabel={`${type.label}: ${item.title || item.url}`}
    >
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.cardPressed]}>
          {image ? (
            <PreviewImage uri={image} knownAr={knownRatio(item)} />
          ) : (
            <View style={styles.textTile}>
              <View style={[styles.typeBadge, { backgroundColor: `${type.tint}1A` }]}>
                <AppIcon icon={type.icon} size={18} color={type.tint} strokeWidth={1.9} />
              </View>
              <Text style={styles.textTitle} numberOfLines={3}>
                {title || host}
              </Text>
              <View style={styles.hostRow}>
                <AppIcon icon={type.icon} size={11} color={colors.faint} strokeWidth={2} />
                <Text style={styles.host} numberOfLines={1}>
                  {host}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function BookmarksScreen() {
  const { workspaceSlug } = useLocalSearchParams<{ workspaceSlug: string }>();
  const { width } = useWindowDimensions();
  const columnCount = width >= 700 ? 3 : 2;
  const {
    data: bookmarks,
    loading,
    refreshing,
    error,
    onRefresh,
  } = useApiList<Bookmark>(() => getBookmarks(workspaceSlug), [workspaceSlug]);

  // Distribute into columns by shortest estimated height so the masonry packs
  // evenly. Estimates use known ratios where available; unknown images fall
  // back to the placeholder ratio (they still render at their true ratio).
  const columns = useMemo(() => {
    const cols: Bookmark[][] = Array.from({ length: columnCount }, () => []);
    const heights = Array.from({ length: columnCount }, () => 0);
    for (const b of bookmarks) {
      const relHeight = previewImage(b) ? 1 / (knownRatio(b) ?? DEFAULT_RATIO) : 0.95;
      let target = 0;
      for (let i = 1; i < columnCount; i++) if (heights[i] < heights[target]) target = i;
      cols[target].push(b);
      heights[target] += relHeight + 0.12;
    }
    return cols;
  }, [bookmarks, columnCount]);

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Bookmarks" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollFade bottomHeight={64}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          >
            {bookmarks.length === 0 ? (
              <Text style={styles.empty}>{error ?? "No bookmarks yet."}</Text>
            ) : (
              <View style={styles.masonryRow}>
                {columns.map((col, index) => (
                  <View key={index} style={styles.column}>
                    {col.map((item) => (
                      <MasonryCard key={item.id} item={item} />
                    ))}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </ScrollFade>
      )}
    </View>
  );
}

const GAP = 12;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingBottom: 8 },
  masonryRow: { flexDirection: "row", gap: GAP, paddingHorizontal: 20 },
  column: { flex: 1, gap: GAP },
  empty: {
    marginTop: 40,
    textAlign: "center",
    fontSize: font.size.sm,
    color: colors.muted,
    fontFamily: "Figtree_400Regular",
  },
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardPressed: { opacity: 0.85 },
  cardImage: { width: "100%", backgroundColor: colors.layer1 },
  textTile: { padding: spacing.md, gap: 8 },
  typeBadge: {
    height: 34,
    width: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  textTitle: { fontSize: font.size.md, lineHeight: 20, color: colors.ink, fontFamily: "Figtree_600SemiBold" },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  host: { flex: 1, fontSize: font.size.xs, color: colors.brandText, fontFamily: "Figtree_500Medium" },
});
