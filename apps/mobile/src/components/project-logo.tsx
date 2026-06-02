import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import type { LogoProps } from "@/lib/api";
import { stringToEmoji } from "@/lib/emoji";
import { colors } from "@/lib/theme";

/**
 * Renders a project's logo: its emoji when one is set, otherwise the initials
 * Avatar (matching the rest of the app). Icon-mode logos rely on web-only icon
 * fonts, so they fall back to initials tinted with the icon's background color.
 */
export function ProjectLogo({
  logo,
  name,
  size = 24,
}: {
  logo?: LogoProps | null;
  name: string;
  size?: number;
}) {
  const emoji = logo?.in_use === "emoji" ? stringToEmoji(logo.emoji?.value ?? "") : "";

  if (emoji) {
    return (
      <View style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}>
        <Text style={{ fontSize: Math.round(size * 0.58), lineHeight: Math.round(size * 0.72) }}>{emoji}</Text>
      </View>
    );
  }

  const iconBackground = logo?.in_use === "icon" ? logo.icon?.background_color : undefined;
  return <Avatar name={name} size={size} color={iconBackground || undefined} />;
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", backgroundColor: colors.layer1 },
});
