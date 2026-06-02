/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Dev-only preview of the toast system — no auth. Trigger every toast
 * type from here to see the top-right placement and styling in context,
 * and compare the candidate style directions side by side.
 *
 * Route: /__preview/toasts
 */

import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Info, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { ToastStatic, setPromiseToast, setToast, TOAST_TYPE, updateToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";

// ---------------------------------------------------------------------------
// Per-type presentation for the static style mockups below. Colors come from
// the raw palette so the saturated fills/glows read on a dark stage; we use
// the real toast types (no separate blue/orange palette in the system).
// ---------------------------------------------------------------------------
const toneVar = (base: string, step: number) => `var(--${base}-${step})`;

const PALETTE = {
  success: {
    base: "green",
    Icon: BadgeCheck,
    title: "Success toast",
    desc: "Notification description will be here",
    label: "Success",
    line: "Workspace deleted successfully. All associated data has been permanently removed.",
  },
  error: {
    base: "red",
    Icon: AlertTriangle,
    title: "Error toast",
    desc: "Notification description will be here",
    label: "Warning",
    line: "This action cannot be undone. Any test, config, insights, and more will be permanently lost.",
  },
  warning: {
    base: "amber",
    Icon: AlertTriangle,
    title: "Warning toast",
    desc: "Proceed with caution",
    label: "Warning",
    line: "This action is irreversible. Deleting a workspace will permanently remove all its data.",
  },
  info: {
    base: "brand",
    Icon: Info,
    title: "Info toast",
    desc: "A new version is available",
    label: "Info",
    line: "Workspace deletion scheduled. You can cancel this action from settings within 24 hours.",
  },
  neutral: {
    base: "neutral",
    Icon: Info,
    title: "Neutral toast",
    desc: "It's a default notification state",
    label: "Neutral",
    line: "It's a default notification state.",
  },
} as const;

type TypeKey = keyof typeof PALETTE;

/** Style 1 — dark card, a single colored mark, an optional action pill (your image 1). */
function ActionPillToast({ typeKey, action, solid }: { typeKey: TypeKey; action: string; solid?: boolean }) {
  const m = PALETTE[typeKey];
  const { Icon } = m;
  return (
    <div className="flex w-full items-center gap-3.5 rounded-2xl border border-subtle bg-surface-2 px-4 py-3.5">
      <Icon width={26} height={26} strokeWidth={2.25} className="shrink-0 text-white" style={{ fill: toneVar(m.base, 500) }} />
      <div className="min-w-0 flex-1">
        <div className="text-body-sm-semibold text-primary">{m.title}</div>
        <div className="text-body-xs-regular text-tertiary">{m.desc}</div>
      </div>
      <button
        type="button"
        className={cn(
          "shrink-0 rounded-full px-3.5 py-1.5 text-body-xs-semibold transition-colors",
          solid ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white/90 hover:bg-white/15"
        )}
      >
        {action}
      </button>
    </div>
  );
}

/** Style 2 — a bright rail with a soft type-colored halo (your image 2). */
function GlowToast({ typeKey }: { typeKey: TypeKey }) {
  const m = PALETTE[typeKey];
  const c = toneVar(m.base, 500);
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border px-4 py-3.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: `color-mix(in oklch, ${c} 32%, transparent)`,
        boxShadow: `0 0 30px -10px color-mix(in oklch, ${c} 70%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="absolute top-3.5 bottom-3.5 left-3.5 w-[3px] rounded-full"
        style={{ background: c, boxShadow: `0 0 8px ${c}` }}
      />
      <p className="pl-6 text-body-sm-regular leading-relaxed text-white/65">
        <span className="font-semibold text-white">{m.label}:</span> {m.line}
      </p>
    </div>
  );
}

/** Style 3 — saturated solid fill with a dark glyph chip (your image 3). */
function SolidToast({ typeKey }: { typeKey: TypeKey }) {
  const m = PALETTE[typeKey];
  const { Icon } = m;
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: toneVar(m.base, 500) }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/20">
        <Icon width={20} height={20} strokeWidth={2.25} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm-semibold text-black">{m.title}</div>
        <div className="text-body-xs-regular text-black/65">{m.desc}</div>
      </div>
      <X width={18} height={18} className="shrink-0 text-black/55" />
    </div>
  );
}

/** Dark backdrop so the glow/contrast reads the way it does in the reference mocks. */
function DarkStage({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-6">
      {children}
    </div>
  );
}

function StyleBlock({ name, note, tag, children }: { name: string; note: string; tag?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-body-sm-semibold text-primary">{name}</span>
        {tag && (
          <span className="rounded-full bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
            {tag}
          </span>
        )}
      </div>
      {children}
      <p className="text-body-xs-regular text-tertiary">{note}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body-sm-semibold text-primary">{title}</h2>
        {subtitle && <p className="max-w-[70ch] text-body-xs-regular text-tertiary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live triggers — these fire real toasts into the top-right viewport.
// ---------------------------------------------------------------------------
function fakeRequest(ms: number, shouldReject = false) {
  return new Promise<{ name: string }>((resolve, reject) => {
    setTimeout(() => (shouldReject ? reject(new Error("failed")) : resolve({ name: "Report.pdf" })), ms);
  });
}

const LIVE_TRIGGERS: { label: string; run: () => void }[] = [
  {
    label: "Success",
    run: () => setToast({ type: TOAST_TYPE.SUCCESS, title: "Changes saved", message: "Your document is up to date." }),
  },
  {
    label: "Error",
    run: () =>
      setToast({ type: TOAST_TYPE.ERROR, title: "Couldn't save", message: "Something went wrong. Please try again." }),
  },
  {
    label: "Warning",
    run: () =>
      setToast({ type: TOAST_TYPE.WARNING, title: "Unsaved changes", message: "Leaving now will discard your edits." }),
  },
  {
    label: "Info",
    run: () => setToast({ type: TOAST_TYPE.INFO, title: "Heads up", message: "A new version is available." }),
  },
  {
    label: "Loading",
    run: () => setToast({ type: TOAST_TYPE.LOADING, title: "Syncing your workspace…" }),
  },
  {
    label: "With action",
    run: () =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Item archived",
        message: "You can still find it in the archive.",
        // No styling here — the toast renders simple actions as a pill by default.
        actionItems: (
          <button type="button" onClick={() => setToast({ type: TOAST_TYPE.INFO, title: "Restored" })}>
            Undo
          </button>
        ),
      }),
  },
];

export default function ToastPreviewPage() {
  const triggerPromise = () =>
    setPromiseToast(fakeRequest(2200), {
      loading: "Uploading file…",
      success: { title: "Upload complete", message: (d) => `${d.name} is ready.` },
      error: { title: "Upload failed", message: () => "Please try again." },
    });

  const triggerUpdate = () => {
    const id = setToast({ type: TOAST_TYPE.LOADING, title: "Generating summary…" });
    if (typeof id === "string") {
      setTimeout(() => {
        updateToast(id, { type: TOAST_TYPE.SUCCESS, title: "Summary ready", message: "Open it from the sidebar." });
      }, 2200);
    }
  };

  const triggerStack = () => {
    setToast({ type: TOAST_TYPE.INFO, title: "Queued", message: "Three items lined up." });
    setTimeout(() => setToast({ type: TOAST_TYPE.WARNING, title: "Almost there", message: "Finishing up." }), 350);
    setTimeout(() => setToast({ type: TOAST_TYPE.SUCCESS, title: "All done", message: "Everything synced." }), 700);
  };

  return (
    <div className="min-h-screen bg-surface-2 px-6 py-12">
      <div className="mx-auto flex max-w-[860px] flex-col gap-12">
        {/* Header */}
        <header className="flex flex-col gap-1">
          <span className="text-body-xs-medium text-placeholder">Dev preview</span>
          <h1 className="text-xl font-semibold text-primary">Toasts</h1>
          <p className="max-w-[60ch] text-body-sm-regular text-tertiary">
            Notifications now anchor to the <span className="text-secondary">top-right</span>. Trigger a few below — they
            appear in the corner of this page — then compare the style directions and pick one to ship.
          </p>
        </header>

        {/* Live triggers */}
        <Section
          title="Trigger live toasts"
          subtitle="Fires into the real top-right viewport. Hover to expand the stack; swipe up or right to dismiss."
        >
          <div className="flex flex-wrap gap-2">
            {LIVE_TRIGGERS.map((t) => (
              <Button key={t.label} variant="secondary" size="sm" onClick={t.run}>
                {t.label}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={triggerPromise}>
              Promise
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerUpdate}>
              Loading → success
            </Button>
            <Button variant="secondary" size="sm" onClick={triggerStack}>
              Stack of three
            </Button>
          </div>
        </Section>

        {/* Style directions — from the reference mocks */}
        <Section
          title="Style directions"
          subtitle="Three takes from your references, rendered with our own tokens on a dark surface. Say the word and I'll wire whichever you pick into the live toast above."
        >
          <div className="flex flex-col gap-8">
            <StyleBlock
              name="Action pill"
              tag="Live"
              note="Dark card, one colored badge, an optional action on the right. Calm and premium — now wired into the live toast above."
            >
              <DarkStage>
                <ActionPillToast typeKey="success" action="Got It!" />
                <ActionPillToast typeKey="error" action="Fixing!" solid />
              </DarkStage>
            </StyleBlock>

            <StyleBlock
              name="Accent glow"
              note="A bright rail with a soft type-colored halo. Catches the eye, stays subtle."
            >
              <DarkStage>
                <GlowToast typeKey="error" />
                <GlowToast typeKey="success" />
                <GlowToast typeKey="warning" />
                <GlowToast typeKey="info" />
              </DarkStage>
            </StyleBlock>

            <StyleBlock
              name="Solid fill"
              note="Saturated and high-contrast — impossible to miss, but the least “less is more” of the set."
            >
              <DarkStage>
                <SolidToast typeKey="neutral" />
                <SolidToast typeKey="success" />
                <SolidToast typeKey="warning" />
                <SolidToast typeKey="error" />
              </DarkStage>
            </StyleBlock>
          </div>
        </Section>

        {/* Current live style — all types in both themes */}
        <Section
          title="Current live style"
          subtitle="What ships today: the Action pill style — a filled type badge with the message and an optional action, in light and dark."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["light", "dark"] as const).map((theme) => (
              <div
                key={theme}
                data-theme={theme}
                className="flex flex-col items-center gap-3 rounded-xl border border-subtle bg-surface-2 p-5"
              >
                <span className="text-body-xs-medium text-placeholder capitalize">{theme}</span>
                <ToastStatic theme={theme} type={TOAST_TYPE.SUCCESS} title="Changes saved" message="Your document is up to date." />
                <ToastStatic theme={theme} type={TOAST_TYPE.ERROR} title="Couldn't save" message="Something went wrong. Please try again." />
                <ToastStatic theme={theme} type={TOAST_TYPE.WARNING} title="Unsaved changes" message="Leaving now will discard your edits." />
                <ToastStatic theme={theme} type={TOAST_TYPE.INFO} title="Heads up" message="A new version is available." />
                <ToastStatic
                  theme={theme}
                  type={TOAST_TYPE.SUCCESS}
                  title="Item archived"
                  message="You can still find it in the archive."
                  actionItems={<button type="button">Undo</button>}
                />
                <ToastStatic theme={theme} type={TOAST_TYPE.LOADING} title="Syncing your workspace…" />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
