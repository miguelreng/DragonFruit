import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { AccountPanel } from "@/components/account-panel";
import { DocsDirectory } from "@/components/docs-directory";
import { IslandTabBar, type IslandTabOption } from "@/components/island-tab-bar";
import { StickiesBoard } from "@/components/stickies-board";
import { TasksList } from "@/components/tasks-list";
import { VoiceCapture } from "@/components/voice-capture";
import { getWorkspaces, type Workspace } from "@/lib/api";
import {
  AtlasTabActiveIcon,
  AtlasTabIcon,
  DocsTabActiveIcon,
  DocsTabIcon,
  MicrophoneActiveIcon,
  MicrophoneIcon,
  StickiesTabActiveIcon,
  StickiesTabIcon,
  TasksTabActiveIcon,
  TasksTabIcon,
  UserActiveIcon,
  UserIcon,
} from "@/lib/icons";
import { motion } from "@/lib/motion";
import { setLastWorkspaceSlug } from "@/lib/secure-store";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/lib/theme";
import { useApiList } from "@/lib/use-api-list";

// Segmented hub tabs live in the swipe rail. "atlas" is not one of them — it's
// a launcher in the tab bar that pushes the full-screen chat (see `TabValue`).
type HubTab = "voice" | "stickies" | "docs" | "tasks" | "account";

// The tab bar shows the rail tabs plus a leading Atlas launcher.
type TabValue = HubTab | "atlas";

const TAB_INDEX: Record<HubTab, number> = { voice: 0, stickies: 1, docs: 2, tasks: 3, account: 4 };

function HubPage({
  index,
  active,
  position,
  width,
  children,
}: {
  index: number;
  active: boolean;
  position: SharedValue<number>;
  width: number;
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(position.value - index);
    return {
      opacity: interpolate(distance, [0, 0.7, 1], [1, 0.82, 0.62], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(distance, [0, 1], [1, 0.985], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      style={[styles.page, { width, flexGrow: 0, flexShrink: 0 }, animatedStyle]}
      pointerEvents={active ? "auto" : "none"}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
}

export function WorkspaceHub({ workspaceSlug, initialTab = "voice" }: { workspaceSlug: string; initialTab?: HubTab }) {
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [contentWidth, setContentWidth] = useState(0);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const reducedMotion = useReducedMotion();
  const position = useSharedValue(TAB_INDEX[initialTab]);
  const { data: workspaces } = useApiList<Workspace>(getWorkspaces, []);
  const accountName = user?.display_name || user?.first_name || user?.email || "You";

  const tabOptions = useMemo<IslandTabOption<TabValue>[]>(
    () => [
      // Leading, brand-emphasized launcher — opens the full-screen chat rather
      // than swapping the rail, so the tab bar clears out of the chat.
      { value: "atlas", label: "Atlas", icon: AtlasTabIcon, activeIcon: AtlasTabActiveIcon, emphasis: true },
      { value: "voice", label: "Voice", icon: MicrophoneIcon, activeIcon: MicrophoneActiveIcon },
      { value: "stickies", label: "Stickies", icon: StickiesTabIcon, activeIcon: StickiesTabActiveIcon },
      { value: "docs", label: "Docs", icon: DocsTabIcon, activeIcon: DocsTabActiveIcon },
      { value: "tasks", label: "Tasks", icon: TasksTabIcon, activeIcon: TasksTabActiveIcon },
      {
        value: "account",
        label: "Account",
        icon: UserIcon,
        activeIcon: UserActiveIcon,
        avatar: { name: accountName, imageUrl: user?.avatar_url || user?.avatar },
      },
    ],
    [accountName, user?.avatar, user?.avatar_url]
  );

  useEffect(() => {
    const next = TAB_INDEX[activeTab];
    position.value = reducedMotion
      ? next
      : withTiming(next, {
          duration: motion.tabs.duration,
          easing: Easing.bezier(...motion.tabs.easing),
        });
  }, [activeTab, position, reducedMotion]);

  const railStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.value * contentWidth }],
  }));

  const onContentLayout = (event: LayoutChangeEvent) => setContentWidth(event.nativeEvent.layout.width);

  const afterStoppingRecording = (action: () => void, message: string) => {
    if (!voiceRecording) {
      action();
      return;
    }
    Alert.alert("Stop recording?", message, [
      { text: "Keep recording", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: action },
    ]);
  };

  const changeTab = (tab: HubTab) => {
    if (tab === activeTab) return;
    afterStoppingRecording(() => setActiveTab(tab), "Your transcript will be kept here for review.");
  };

  // The Atlas launcher pushes the full-screen chat over the hub (so the tab bar
  // clears out of the chat) instead of swapping a rail page; everything else is
  // a normal segment switch. Recording keeps running on the hub underneath.
  const onSelectTab = (value: TabValue) => {
    if (value === "atlas") {
      router.push({ pathname: "/[workspaceSlug]/atlas", params: { workspaceSlug } });
      return;
    }
    changeTab(value);
  };

  const switchWorkspace = (slug: string) => {
    if (slug === workspaceSlug) return;
    void setLastWorkspaceSlug(slug);
    router.replace({ pathname: "/[workspaceSlug]", params: { workspaceSlug: slug, tab: activeTab } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View
        style={[styles.contentWindow, { paddingBottom: 70 + Math.max(insets.bottom, spacing.sm) }]}
        onLayout={onContentLayout}
      >
        {contentWidth > 0 ? (
          <Animated.View style={[styles.rail, { width: contentWidth * 5 }, railStyle]}>
            <HubPage index={0} active={activeTab === "voice"} position={position} width={contentWidth}>
              <VoiceCapture
                key={workspaceSlug}
                workspaceSlug={workspaceSlug}
                active={activeTab === "voice"}
                onRecordingChange={setVoiceRecording}
              />
            </HubPage>
            <HubPage index={1} active={activeTab === "stickies"} position={position} width={contentWidth}>
              <StickiesBoard key={workspaceSlug} workspaceSlug={workspaceSlug} />
            </HubPage>
            <HubPage index={2} active={activeTab === "docs"} position={position} width={contentWidth}>
              <DocsDirectory key={workspaceSlug} workspaceSlug={workspaceSlug} />
            </HubPage>
            <HubPage index={3} active={activeTab === "tasks"} position={position} width={contentWidth}>
              <TasksList key={workspaceSlug} workspaceSlug={workspaceSlug} />
            </HubPage>
            <HubPage index={4} active={activeTab === "account"} position={position} width={contentWidth}>
              <AccountPanel
                workspaces={workspaces}
                currentSlug={workspaceSlug}
                onSelectWorkspace={(slug) =>
                  afterStoppingRecording(
                    () => switchWorkspace(slug),
                    "The current transcript will be discarded when you switch workspaces."
                  )
                }
              />
            </HubPage>
          </Animated.View>
        ) : null}
      </View>

      <IslandTabBar<TabValue>
        options={tabOptions}
        value={activeTab}
        onChange={onSelectTab}
        accessibilityLabel="Mobile app sections"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  contentWindow: { flex: 1, overflow: "hidden" },
  rail: { flex: 1, flexDirection: "row" },
  page: { height: "100%" },
});
