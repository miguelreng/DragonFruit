import { cn } from "@dragonfruit/utils";

export function AtlasDocumentPreparingOverlay({ blockWidthClassName }: { blockWidthClassName: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-20 min-h-[calc(100vh-7rem)] cursor-wait bg-surface-1"
      data-atlas-document-skeleton="true"
    >
      <div
        className={cn(blockWidthClassName, "animate-pulse px-page-x pt-5 motion-reduce:animate-none")}
        data-atlas-skeleton-motion="pulse"
      >
        <div className="h-3 w-20 rounded-full bg-layer-1" />
        <div className="mt-4 h-9 w-3/4 max-w-[520px] rounded-lg bg-layer-1" />
        <div className="mt-12 space-y-3">
          <div className="h-3.5 w-full rounded-full bg-layer-1" />
          <div className="h-3.5 w-[94%] rounded-full bg-layer-1" />
          <div className="h-3.5 w-[78%] rounded-full bg-layer-1" />
        </div>
        <div className="mt-9 h-5 w-2/5 rounded-md bg-layer-1" />
        <div className="mt-4 space-y-3">
          <div className="h-3.5 w-[96%] rounded-full bg-layer-1" />
          <div className="h-3.5 w-full rounded-full bg-layer-1" />
          <div className="h-3.5 w-[87%] rounded-full bg-layer-1" />
          <div className="h-3.5 w-[62%] rounded-full bg-layer-1" />
        </div>
        <div className="mt-9 space-y-3 pl-5">
          <div className="h-3.5 w-[82%] rounded-full bg-layer-1" />
          <div className="h-3.5 w-[76%] rounded-full bg-layer-1" />
          <div className="h-3.5 w-[68%] rounded-full bg-layer-1" />
        </div>
      </div>
    </div>
  );
}
