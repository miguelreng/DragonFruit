import type React from "react";
import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { AtlasChat } from "@/components/atlas-chat";

// Mirrors the left sidebar drawer: arm within 48px of the (right) edge, and the
// settle physics that decide open vs. closed on release.
const EDGE_WIDTH = 48;
const SETTLE = 0.4; // past 40% revealed → settle open
const FLING_VELOCITY = 500; // px/s flick that opens/closes regardless of distance
const SPRING = { damping: 24, stiffness: 260, mass: 0.7 };

/**
 * Right-edge interactive slide-over for Ask Atlas — the mirror image of the
 * left sidebar drawer. Dragging in from the right edge pulls the Atlas panel
 * across, tracking the finger so you can peek and then release to settle it
 * open or let it fall back to home; once open, drag it back to the right (or
 * tap the header arrow) to dismiss. The chat mounts lazily on the first drag
 * and stays mounted, so its session and scrollback survive a close/reopen.
 */
export function AtlasPeek({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0); // 0 = home, 1 = Atlas fully open
  const start = useSharedValue(0); // progress captured at gesture start
  // `mounted` gates the (network-bootstrapping) chat so home never pays for it
  // until the first peek; `open` flips the panel's touch handling on once it's
  // settled in, so a closed/off-screen panel never swallows taps meant for home.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const wake = () => setMounted(true);
  const close = () => {
    setOpen(false);
    progress.value = withSpring(0, SPRING);
  };

  // Pull Atlas in from the right edge — the gesture only arms in the right strip
  // and on a leftward drag, and yields to vertical scrolling underneath.
  const openPan = Gesture.Pan()
    .hitSlop({ right: 0, width: EDGE_WIDTH })
    .activeOffsetX(-15)
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.value = progress.value;
      runOnJS(wake)();
    })
    .onChange((e) => {
      const p = start.value - e.translationX / width;
      progress.value = p < 0 ? 0 : p > 1 ? 1 : p;
    })
    .onEnd((e) => {
      const target = e.velocityX < -FLING_VELOCITY ? 1 : e.velocityX > FLING_VELOCITY ? 0 : progress.value >= SETTLE ? 1 : 0;
      progress.value = withSpring(target, SPRING);
      runOnJS(setOpen)(target === 1);
    });

  // Swipe the open panel back toward the right to dismiss — the same drag in
  // reverse. It rides on top of the chat but only claims clear horizontal
  // drags, so taps, the composer, and vertical scroll all pass through.
  const closePan = Gesture.Pan()
    .activeOffsetX(15)
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.value = progress.value;
    })
    .onChange((e) => {
      const p = start.value - e.translationX / width;
      progress.value = p < 0 ? 0 : p > 1 ? 1 : p;
    })
    .onEnd((e) => {
      const target = e.velocityX < -FLING_VELOCITY ? 1 : e.velocityX > FLING_VELOCITY ? 0 : progress.value >= SETTLE ? 1 : 0;
      progress.value = withSpring(target, SPRING);
      runOnJS(setOpen)(target === 1);
    });

  // Home dims as Atlas peeks across — mirrors the sidebar's scrim.
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.4 }));
  // The panel starts a full width off the right edge and slides to 0 as it opens.
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - progress.value) * width }] }));

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={openPan}>
        <View style={styles.fill}>{children}</View>
      </GestureDetector>

      <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]} />

      <GestureDetector gesture={closePan}>
        <Animated.View style={[styles.panel, panelStyle]} pointerEvents={open ? "auto" : "none"}>
          {mounted ? <AtlasChat onClose={close} /> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" },
  panel: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
