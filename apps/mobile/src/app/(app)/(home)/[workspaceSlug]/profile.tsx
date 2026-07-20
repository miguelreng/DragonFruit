import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { ArrowRight01Icon, GlobeIcon, Logout03Icon, Mail01Icon } from "@/lib/icons";

import { AppIcon } from "@/components/app-icon";
import { Avatar } from "@/components/avatar";
import { ScreenHeader } from "@/components/screen-header";
import { ScrollFade } from "@/components/scroll-fade";
import { openWeb } from "@/lib/open-web";
import { useSession } from "@/lib/session";
import { colors, font, radius, shadow, spacing } from "@/lib/theme";

export default function ProfileScreen() {
  const { user, signOut } = useSession();
  const displayName = user?.display_name || user?.first_name || user?.email || "You";
  const version = Constants.expoConfig?.version ?? "1.0.0";

  const confirmSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to use DragonFruit.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Profile" />

      <ScrollFade bottomHeight={64}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.identity}>
            <Avatar name={displayName} size={72} circle imageUrl={user?.avatar_url || user?.avatar} />
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {user?.email ? (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            {user?.email ? (
              <>
                <View style={styles.row}>
                  <AppIcon icon={Mail01Icon} size={18} color={colors.body} strokeWidth={1.9} />
                  <Text style={styles.rowLabel}>Email</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {user.email}
                  </Text>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}
            <Pressable onPress={() => openWeb("/")} accessibilityRole="button" accessibilityLabel="Open the web app">
              {({ pressed }) => (
                <View style={[styles.row, pressed && styles.rowPressed]}>
                  <AppIcon icon={GlobeIcon} size={18} color={colors.body} strokeWidth={1.9} />
                  <Text style={styles.rowLabel}>Open web app</Text>
                  <AppIcon icon={ArrowRight01Icon} size={16} color={colors.faint} strokeWidth={1.9} />
                </View>
              )}
            </Pressable>
          </View>

          <Pressable onPress={confirmSignOut} accessibilityRole="button" accessibilityLabel="Sign out">
            {({ pressed }) => (
              <View style={[styles.signOut, pressed && styles.signOutPressed]}>
                <AppIcon icon={Logout03Icon} size={18} color={colors.danger} strokeWidth={1.9} />
                <Text style={styles.signOutText}>Sign out</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.version}>DragonFruit for iOS · v{version}</Text>
        </ScrollView>
      </ScrollFade>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  identity: { alignItems: "center", paddingVertical: spacing.lg },
  name: { marginTop: spacing.md, fontSize: font.size.xl, color: colors.ink, fontFamily: "Figtree_700Bold" },
  email: { marginTop: 2, fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular" },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  rowPressed: { backgroundColor: colors.layerTransparentHover },
  rowLabel: { flex: 1, fontSize: font.size.sm, color: colors.ink, fontFamily: "Figtree_500Medium" },
  rowValue: { fontSize: font.size.sm, color: colors.muted, fontFamily: "Figtree_400Regular", maxWidth: "55%" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.md },
  signOut: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
  },
  signOutPressed: { backgroundColor: colors.dangerSoft },
  signOutText: { fontSize: font.size.md, color: colors.danger, fontFamily: "Figtree_600SemiBold" },
  version: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: font.size.xs,
    color: colors.faint,
    fontFamily: "Figtree_400Regular",
  },
});
