/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, useCallback } from "react";
import { Command } from "cmdk";
import { Loader2, Sparkles } from "@/components/icons/lucide-shim";
import { cn } from "@plane/utils";
import { AIService } from "@/services/ai.service";

type Props = {
  workspaceSlug: string | undefined;
  searchTerm: string;
};

const aiService = new AIService();

export function PowerKAskAISection(props: Props) {
  const { workspaceSlug, searchTerm } = props;
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);

  const ask = useCallback(async () => {
    const trimmed = searchTerm.trim();
    if (!workspaceSlug || !trimmed || pending) return;
    setPending(true);
    setError(null);
    setAnswer(null);
    setSubmittedFor(trimmed);
    try {
      const res = await aiService.createGptTask(workspaceSlug, {
        prompt: trimmed,
        task: "Answer the user's question concisely. If you don't know, say so.",
        // Tells the backend to load the user's open tasks and prepend them as
        // grounding context, so questions like "what's on my plate?" resolve to
        // their actual workspace tasks instead of a generic refusal.
        include_workspace_context: true,
      });
      const text =
        (typeof res === "string" && res) || res?.response || res?.answer || res?.message || res?.content || "";
      if (text) {
        setAnswer(text);
      } else {
        setError("The LLM returned an empty response.");
      }
    } catch (err: any) {
      const detail =
        err?.data?.error ||
        err?.data?.detail ||
        (typeof err?.data === "string" ? err.data : undefined) ||
        err?.statusText;
      setError(detail || "Could not reach the configured LLM provider. Check Settings → AI.");
    } finally {
      setPending(false);
    }
  }, [workspaceSlug, searchTerm, pending]);

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <Command.Group heading="Ask Atlas" forceMount>
      <Command.Item
        value={`ai-ask-trigger ${searchTerm}`}
        forceMount
        onSelect={ask}
        disabled={!hasQuery || pending}
        className="focus:outline-none"
      >
        <div className="flex min-w-0 items-center gap-2 text-secondary">
          {pending ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-primary" />
          ) : (
            <Sparkles className="size-3.5 shrink-0 text-accent-primary" />
          )}
          <span className="truncate">
            {hasQuery ? (
              <>
                Ask Atlas: <span className="text-primary">{searchTerm}</span>
              </>
            ) : (
              <span className="text-tertiary">Type a question to ask your configured LLM</span>
            )}
          </span>
        </div>
        <span className="shrink-0 text-11 text-tertiary">↵</span>
      </Command.Item>
      {(answer || error) && (
        <div
          className={cn("mx-2 mt-1 rounded border border-subtle bg-layer-1 p-2 text-12 leading-snug", {
            "text-secondary": !!answer,
            "text-danger-primary": !!error,
          })}
        >
          {error ?? answer}
          {submittedFor && answer && <div className="mt-2 text-11 text-tertiary">For: {submittedFor}</div>}
        </div>
      )}
    </Command.Group>
  );
}
