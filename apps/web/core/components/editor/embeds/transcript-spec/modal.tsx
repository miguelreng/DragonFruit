/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, Wand2 } from "@/components/icons/lucide-shim";
// plane imports
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { AIService } from "@/services/ai.service";
import type { TTranscriptToDocResponse } from "@/services/ai.service";
// local
import { transcriptResponseToProseMirror } from "./convert";
import { cleanGranolaExport, looksLikeGranolaExport } from "./granola";

const aiService = new AIService();

type InsertContent = (json: object) => void;

type Props = {
  isOpen: boolean;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  onClose: () => void;
  /** Called with the generated ProseMirror doc when the user confirms. */
  onInsert: InsertContent;
};

type Stage = "compose" | "preview";

export function TranscriptSpecModal(props: Props) {
  const { isOpen, workspaceSlug, projectId, onClose, onInsert } = props;
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanedSummary, setCleanedSummary] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("compose");
  const [preview, setPreview] = useState<TTranscriptToDocResponse | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTranscript("");
    setHint("");
    setError(null);
    setIsGenerating(false);
    setCleanedSummary(null);
    setStage("compose");
    setPreview(null);
    const t = window.setTimeout(() => textAreaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const granolaDetected = useMemo(
    () => cleanedSummary === null && looksLikeGranolaExport(transcript),
    [transcript, cleanedSummary]
  );

  const handleCleanGranola = useCallback(() => {
    const result = cleanGranolaExport(transcript);
    if (!result.wasGranola) return;
    setTranscript(result.cleaned);
    const bits: string[] = [];
    if (result.keptOnlyTranscriptSection) bits.push("kept only the transcript section");
    if (result.removedMetadataLines > 0)
      bits.push(`removed ${result.removedMetadataLines} metadata line${result.removedMetadataLines === 1 ? "" : "s"}`);
    if (result.removedTimestampMarkers > 0)
      bits.push(
        `stripped ${result.removedTimestampMarkers} timestamp marker${result.removedTimestampMarkers === 1 ? "" : "s"}`
      );
    setCleanedSummary(bits.length > 0 ? `Cleaned Granola export — ${bits.join(", ")}.` : "Cleaned Granola export.");
  }, [transcript]);

  const handleTranscriptChange = useCallback((value: string) => {
    setTranscript(value);
    setCleanedSummary(null);
  }, []);

  const canSubmit = useMemo(
    () => Boolean(workspaceSlug && projectId && transcript.trim().length > 20 && !isGenerating),
    [workspaceSlug, projectId, transcript, isGenerating]
  );

  const handleGenerate = useCallback(async () => {
    if (!workspaceSlug || !projectId) {
      setError("Open a project page to generate a spec.");
      return;
    }
    const trimmed = transcript.trim();
    if (trimmed.length < 20) {
      setError("Paste at least a couple of sentences from the meeting.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const response = await aiService.transcriptToDoc(workspaceSlug, projectId, {
        transcript: trimmed,
        hint: hint.trim() || undefined,
      });
      setPreview(response);
      setStage("preview");
    } catch (err) {
      const message =
        err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "Couldn't draft the spec. Check that the workspace has an LLM API key configured.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceSlug, projectId, transcript, hint]);

  const handleInsert = useCallback(() => {
    if (!preview || !workspaceSlug || !projectId) return;
    const pm = transcriptResponseToProseMirror(preview, { workspaceSlug, projectId });
    onInsert(pm);
    onClose();
  }, [preview, workspaceSlug, projectId, onInsert, onClose]);

  const handleBack = useCallback(() => {
    setStage("compose");
    setPreview(null);
  }, []);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b border-subtle px-5 py-3">
          {stage === "preview" && (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-12 text-tertiary hover:text-primary"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
          )}
          <Sparkles className="size-4 shrink-0 text-accent-primary" />
          <h2 className="text-14 font-medium text-primary">
            {stage === "preview" ? "Preview spec" : "Spec from transcript"}
          </h2>
          <span className="ml-auto text-12 text-tertiary">
            {stage === "preview"
              ? `${preview?.sections.length ?? 0} section${(preview?.sections.length ?? 0) === 1 ? "" : "s"} · ${
                  preview?.action_items.length ?? 0
                } action item${(preview?.action_items.length ?? 0) === 1 ? "" : "s"}`
              : "Paste a meeting, get a draft"}
          </span>
        </div>

        {stage === "compose" ? (
          <>
            <div className="flex flex-col gap-3 px-5 py-4">
              <label className="block">
                <span className="block text-12 font-medium text-secondary">Optional context</span>
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder='e.g. "discovery call with Acme; we sell warehouse robotics"'
                  className="mt-1 w-full rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder focus:border-strong focus:outline-none"
                />
              </label>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="block text-12 font-medium text-secondary">Transcript</span>
                  {granolaDetected && (
                    <button
                      type="button"
                      onClick={handleCleanGranola}
                      className="flex items-center gap-1 text-11 font-medium text-accent-primary hover:underline"
                    >
                      <Wand2 className="size-3" />
                      Granola export detected — clean it up
                    </button>
                  )}
                </div>
                <textarea
                  ref={textAreaRef}
                  value={transcript}
                  onChange={(e) => handleTranscriptChange(e.target.value)}
                  placeholder="Paste the meeting transcript here…"
                  rows={12}
                  className="mt-1 w-full resize-y rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-2 text-13 text-primary placeholder:text-placeholder focus:border-strong focus:outline-none"
                />
                {cleanedSummary && <p className="mt-1 text-11 text-tertiary">{cleanedSummary}</p>}
              </label>
              {error && <p className="text-error text-12">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
              <p className="text-12 text-tertiary">
                You&apos;ll see a preview of the spec before anything lands in the doc.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-1.5 text-13 text-primary hover:bg-layer-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void handleGenerate()}
                  className={cn(
                    "text-on-accent-primary flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium transition-opacity",
                    !canSubmit && "cursor-not-allowed opacity-50"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Drafting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Generate preview
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <PreviewBody preview={preview} onBack={handleBack} onInsert={handleInsert} />
        )}
      </div>
    </ModalCore>
  );
}

function PreviewBody(props: { preview: TTranscriptToDocResponse | null; onBack: () => void; onInsert: () => void }) {
  const { preview, onBack, onInsert } = props;
  if (!preview) return null;
  return (
    <>
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {preview.sections.length === 0 && preview.action_items.length === 0 && (
          <p className="text-13 text-tertiary">
            The model didn&apos;t pull anything actionable from this transcript. Try adding context above and
            regenerate.
          </p>
        )}

        {preview.sections.map((section) => (
          <section key={`section-${section.heading}-${section.body_markdown.slice(0, 24)}`} className="mb-5">
            <h3 className="mb-2 text-14 font-semibold text-primary">{section.heading}</h3>
            <div className="text-13 whitespace-pre-wrap text-secondary">{section.body_markdown}</div>
          </section>
        ))}

        {preview.action_items.length > 0 && (
          <section>
            <h3 className="mb-2 text-14 font-semibold text-primary">Action items</h3>
            <ul className="flex flex-col gap-2">
              {preview.action_items.map((item) => (
                <li
                  key={`item-${item.title}-${item.description.slice(0, 24)}`}
                  className="flex items-start gap-2 rounded-md border-[0.5px] border-dashed border-strong bg-accent-subtle px-3 py-2"
                >
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-13 text-primary">{item.title}</p>
                    {item.description && <p className="mt-0.5 text-12 text-secondary">{item.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
        <p className="text-12 text-tertiary">
          Action items will be inserted as drafts. Click each card&apos;s <span className="font-medium">Create</span>{" "}
          button in the doc to make them real.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border-[0.5px] border-subtle bg-layer-1 px-3 py-1.5 text-13 text-primary hover:bg-layer-2"
          >
            Edit transcript
          </button>
          <button
            type="button"
            onClick={onInsert}
            className="text-on-accent-primary flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium"
          >
            <Sparkles className="size-3.5" />
            Insert at cursor
          </button>
        </div>
      </div>
    </>
  );
}
