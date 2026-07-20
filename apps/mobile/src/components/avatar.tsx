import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { APP_HOST } from "@/lib/config";
import { avatarColor, colors } from "@/lib/theme";

/**
 * Workspace logos and user avatars come back from the API as host-relative
 * paths (e.g. `/api/assets/v2/static/<id>/`, which 302-redirects to a presigned
 * S3 URL). React Native's <Image> can't load a path without a host, so resolve
 * relative URLs against APP_HOST; absolute (http) URLs — e.g. OAuth profile
 * pictures — pass through untouched.
 */
function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;

  // The web profile settings generate DiceBear avatars as SVGs. iOS's native
  // image loader (used by expo-image) cannot decode those SVG responses, so
  // request the equivalent PNG representation on mobile instead.
  const nativeUrl = url.replace(/^(https?:\/\/api\.dicebear\.com\/[^/]+\/[^/]+)\/svg(?=\?|$)/i, "$1/png");

  if (/^https?:\/\//i.test(nativeUrl)) return nativeUrl;
  return `${APP_HOST}/${nativeUrl.replace(/^\/+/, "")}`;
}

/**
 * Initials avatar with a deterministic brand-family color. When `imageUrl` is
 * provided (a real profile picture or workspace logo), the photo is shown and
 * the initials act as the fallback if the URL is missing or fails to load — so
 * the slot is never blank.
 */
export function Avatar({
  name,
  size = 40,
  circle = false,
  color,
  imageUrl,
}: {
  name: string;
  size?: number;
  circle?: boolean;
  color?: string;
  imageUrl?: string | null;
}) {
  const radius = circle ? size / 2 : Math.round(size * 0.3);
  const resolved = resolveImageUrl(imageUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (resolved && resolved !== failedUrl) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setFailedUrl(resolved)}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.layer1 }}
      />
    );
  }

  const initials = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: color ?? avatarColor(name) },
      ]}
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.42) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  text: { color: colors.white, fontWeight: "700" },
});
