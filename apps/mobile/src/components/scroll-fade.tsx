import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "@/lib/theme";

// Canvas (#f4f5f5) as solid + fully clear, so the fades blend into the
// background without the black tint a bare "transparent" stop causes. Mirrors
// the Ask Atlas page so scrolled content melts under the header/footer instead
// of hard-cutting at the edges.
const FADE_SOLID = colors.canvas;
const FADE_CLEAR = "rgba(244, 245, 245, 0)";

/**
 * Wraps a single scroll element (ScrollView / FlatList / SectionList) in a
 * relative, flex:1 container and lays two canvas-colored gradients over it: a
 * solid→clear fade at the top (under the header) and a clear→solid fade at the
 * bottom (above the footer). The overlays are non-interactive so touches pass
 * through.
 *
 * The fades are always present (they're what makes scrolled content melt under
 * the header/footer). To keep them from washing over the *last* items when a
 * list is short or scrolled flush to an edge, we pad the scroll content by the
 * fade heights so resting items clear the fade region — only scrolling content
 * passes under and fades.
 *
 * Bottom defaults to 120 to clear a composer/footer (Ask Atlas, issue detail);
 * pass a smaller `bottomHeight` for plain list pages with no footer.
 */
export function ScrollFade({
  children,
  top = true,
  bottom = true,
  topHeight = 32,
  bottomHeight = 120,
  style,
}: {
  children: React.ReactNode;
  top?: boolean;
  bottom?: boolean;
  topHeight?: number;
  bottomHeight?: number;
  style?: ViewStyle;
}) {
  // Pad the scroll content so resting items sit clear of the fades; only ever
  // grow existing padding so each page keeps its own intended spacing.
  let child = children;
  if (React.isValidElement(children)) {
    const childEl = children as React.ReactElement<any>;
    const base = StyleSheet.flatten(childEl.props.contentContainerStyle) ?? {};
    const padded: ViewStyle = { ...base };
    if (top) padded.paddingTop = Math.max(Number(base.paddingTop ?? base.paddingVertical ?? 0), topHeight);
    if (bottom)
      padded.paddingBottom = Math.max(Number(base.paddingBottom ?? base.paddingVertical ?? 0), bottomHeight);
    child = React.cloneElement(childEl, { contentContainerStyle: padded });
  }

  return (
    <View style={[styles.wrap, style]}>
      {child}
      {top ? (
        <LinearGradient
          colors={[FADE_SOLID, FADE_CLEAR]}
          style={[styles.topFade, { height: topHeight }]}
          pointerEvents="none"
        />
      ) : null}
      {bottom ? (
        <LinearGradient
          colors={[FADE_CLEAR, FADE_SOLID]}
          style={[styles.bottomFade, { height: bottomHeight }]}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  topFade: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0 },
});
