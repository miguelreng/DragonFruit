import { Easing } from "react-native";

export const motion = {
  duration: {
    fast: 160,
    control: 200,
    panelClose: 220,
    panelOpen: 250,
  },
  easing: {
    standard: Easing.bezier(0.22, 1, 0.36, 1),
    scrimIn: Easing.out(Easing.quad),
    scrimOut: Easing.in(Easing.quad),
    panelOut: Easing.in(Easing.cubic),
  },
  drawer: {
    edgeWidth: 48,
    overlayOpacity: 0.4,
  },
  panel: {
    settle: 0.4,
    flingVelocity: 500,
    spring: { damping: 24, stiffness: 260, mass: 0.7 },
  },
  sheet: {
    closeDistance: 110,
    closeVelocity: 0.5,
    spring: { damping: 24, stiffness: 240, mass: 0.9 },
    settleSpring: { damping: 24, stiffness: 240 },
  },
  stack: {
    replace: "none",
    detail: "default",
    modal: "fade",
  },
} as const;
