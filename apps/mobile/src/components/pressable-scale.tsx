import { useCallback, type ComponentType } from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { motion } from "@/lib/motion";

/**
 * The mobile counterpart of the web `t-press` primitive: a Pressable that
 * scales down subtly on press so the interface confirms it heard the touch.
 *
 * Drop-in replacement for `Pressable` — forwards every prop, including the
 * `{({ pressed }) => …}` render-prop children, the `style` function form, and
 * any existing `onPressIn`/`onPressOut`. So an element that already shows a
 * pressed background/opacity keeps it and gains the scale on top (colour +
 * scale is the ideal feedback). The scale rides on the UI thread via Reanimated
 * and reverses smoothly if the press is interrupted.
 *
 * Note: the curve matches `motion.easing.standard` (0.22, 1, 0.36, 1) but uses
 * Reanimated's own `Easing` — RN's `Easing` is not worklet-safe inside
 * `withTiming`. Keep row/column layout on an inner View, not on this Pressable
 * (New-Arch Pressable + flexDirection:row stacks children).
 */
// `createAnimatedComponent`'s typings clash with the workspace-pinned
// @types/react (a known ReactNode/bigint version skew that poisons the overload
// resolution at the call site), so we call it untyped. The call is correct at
// runtime, and the public PressableScaleProps below stays fully typed for callers.
const AnimatedPressable = (Animated.createAnimatedComponent as (c: unknown) => ComponentType<any>)(Pressable);

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PRESS_IN = { duration: motion.press.inDuration, easing: EASE };
const PRESS_OUT = { duration: motion.press.outDuration, easing: EASE };

type PressableScaleProps = PressableProps & {
  /** Target scale while pressed. Default 0.97 (subtle). */
  pressedScale?: number;
};

export function PressableScale({
  pressedScale = motion.press.scale,
  onPressIn,
  onPressOut,
  style,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0); // 0 = rest, 1 = fully pressed

  const animatedStyle = useAnimatedStyle(() => ({
    // Reduced motion keeps any colour/opacity press styles but drops movement.
    transform: [{ scale: reduceMotion ? 1 : 1 - (1 - pressedScale) * progress.value }],
  }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      progress.value = withTiming(1, PRESS_IN);
      onPressIn?.(e);
    },
    [onPressIn, progress]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      progress.value = withTiming(0, PRESS_OUT);
      onPressOut?.(e);
    },
    [onPressOut, progress]
  );

  // Compose our scale onto whatever the caller passed — preserving the
  // `({ pressed }) => …` form so existing background/opacity feedback survives.
  const composedStyle =
    typeof style === "function"
      ? (state: PressableStateCallbackType) => [style(state), animatedStyle]
      : [style, animatedStyle];

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={disabled ? onPressIn : handlePressIn}
      onPressOut={disabled ? onPressOut : handlePressOut}
      style={composedStyle}
    />
  );
}
