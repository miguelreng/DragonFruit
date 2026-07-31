import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const getReducedMotionSnapshot = () => typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;

const getServerReducedMotionSnapshot = () => false;

const subscribeToReducedMotion = (onStoreChange: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
};

export const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, getServerReducedMotionSnapshot);

const CIRCLE_A =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";
const INFINITY = "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";
const CIRCLE_B =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

export function AtlasActivityIndicatorGraphic({
  className,
  prefersReducedMotion,
}: {
  className?: string;
  prefersReducedMotion: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
      className={className}
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
    >
      <path d={CIRCLE_A}>
        {!prefersReducedMotion && (
          <animate
            attributeName="d"
            dur="5s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.25;0.5;0.75;1"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
            values={`${CIRCLE_A};${INFINITY};${CIRCLE_B};${INFINITY};${CIRCLE_A}`}
          />
        )}
      </path>
    </svg>
  );
}

export function AtlasActivityIndicator({ className }: { className?: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return <AtlasActivityIndicatorGraphic className={className} prefersReducedMotion={prefersReducedMotion} />;
}
