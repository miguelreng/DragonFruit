import { AtlasChat } from "@/components/atlas-chat";

/**
 * Ask Atlas as a top-level sidebar destination. The sidebar `replace`s into it
 * like the other workspace views; the shared `AtlasChat` body renders a menu
 * button here (stack index 0) and a back arrow in the swipe-in twin.
 */
export default function AtlasScreen() {
  return <AtlasChat />;
}
