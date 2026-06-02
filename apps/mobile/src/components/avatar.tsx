import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

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
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_HOST}/${url.replace(/^\/+/, "")}`;
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
  const [failed, setFailed] = useState(false);
  const radius = circle ? size / 2 : Math.round(size * 0.3);
  const resolved = resolveImageUrl(imageUrl);

  if (resolved && !failed) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setFailed(true)}
        resizeMode="cover"
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
