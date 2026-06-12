/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { APITokenService } from "@plane/services";
import { cn } from "@plane/utils";
// components
import { CreateApiTokenModal } from "@/components/api-token/modal/create-token-modal";
import { ApiTokenListItem } from "@/components/api-token/token-list-item";
import { Copy, ExternalLink } from "@/components/icons/lucide-shim";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// constants
import { API_TOKENS_LIST } from "@/constants/fetch-keys";
// local
import type { Route } from "./+types/page";
import { MCPWorkspaceSettingsHeader } from "./header";

const apiTokenService = new APITokenService();

// The 8 tools DragonFruit's MCP server exposes today. Kept in sync
// with apps/api/plane/app/views/mcp/base.py:TOOLS. When that list
// changes, update here — there's no runtime introspection at this
// level since the page renders before the user has a token.
const SERVER_TOOLS: Array<{ name: string; description: string }> = [
  { name: "list_tasks", description: "List tasks with filters: project, assignee, state, state group, limit." },
  {
    name: "get_task",
    description: "Full details for a single task — description, state, assignees, labels, last 10 comments.",
  },
  { name: "create_task", description: "Create a new task in a project." },
  { name: "update_task", description: "Rename, change state, change priority on an existing task." },
  { name: "add_comment", description: "Post a comment on a task as the API token's owning user." },
  { name: "list_projects", description: "Discover projects in the workspace." },
  { name: "search_pages", description: "Full-text search across docs (up to 25 matches)." },
  { name: "get_page", description: "Read a single doc's text content (up to 8000 chars)." },
];

// Terminal-styled code block: black bg + green monospace, compact font.
// Stays the same in light and dark mode — code samples on the guide
// page are commands and configs, which read most clearly with this
// classic terminal palette regardless of theme.
function CodeBlock({ code, label }: { code: string; label?: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setToast({ type: TOAST_TYPE.SUCCESS, title: label ? `${label} copied` : "Copied" });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Copy failed" });
    }
  };
  // NOTE on color: the named Tailwind palette (`text-green-400`) was
  // getting overridden somewhere — likely by an editor or global CSS
  // rule targeting `<pre>`/`<code>`. Using inline `style={{ color }}`
  // sidesteps every cascade race so the terminal green is guaranteed
  // to land. The hex matches Tailwind's `green-400` (`#4ade80`).
  const TERMINAL_GREEN = "#4ade80";
  return (
    <div className="group relative">
      <pre
        className="font-mono overflow-x-auto rounded border border-black/40 bg-black px-3 py-2 text-[11px] leading-[1.45]"
        style={{ color: TERMINAL_GREEN }}
      >
        <code style={{ color: TERMINAL_GREEN, background: "transparent" }}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10"
        style={{ color: TERMINAL_GREEN }}
        aria-label="Copy"
      >
        <Copy className="size-3" />
      </button>
    </div>
  );
}

// Compact create/list panel for personal API tokens, reusing the same
// service + modal as Settings → API Tokens so tokens minted here show
// up there (and vice versa) without any extra state.
function ApiTokensPanel() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { data: tokens, error } = useSWR(API_TOKENS_LIST, () => apiTokenService.list());

  return (
    <div className="rounded-lg border border-subtle bg-layer-1 p-3">
      <CreateApiTokenModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-caption-md-medium text-primary">Your API tokens</h4>
        <Button variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
          New token
        </Button>
      </div>
      {error ? (
        <p className="text-caption-sm mt-2 text-tertiary">
          Couldn't load your tokens. Try again, or manage them on{" "}
          <Link href="/settings/profile/api-tokens/" className="underline underline-offset-2 hover:text-primary">
            Settings → API Tokens
          </Link>
          .
        </p>
      ) : !tokens ? (
        <p className="text-caption-sm mt-2 text-tertiary">Loading tokens…</p>
      ) : tokens.length > 0 ? (
        <div className="mt-1">
          {tokens.map((token) => (
            <ApiTokenListItem key={token.id} token={token} />
          ))}
        </div>
      ) : (
        <p className="text-caption-sm mt-2 text-tertiary">
          No tokens yet. Create one to connect your first MCP client — the secret is shown once and downloaded as a CSV.
        </p>
      )}
    </div>
  );
}

function MCPSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug?.toString() ?? "";

  // Origin: pick what the user is actually browsing the app from.
  // Self-hosted users will see localhost or their internal host;
  // hosted users see the app domain. In SSR (no window) fall back to
  // a placeholder the user can replace.
  const [origin] = useState<string>(() => {
    if (typeof window === "undefined") return "https://your-dragon-fruit-host";
    return window.location.origin;
  });
  const mcpUrl = useMemo(() => `${origin}/api/workspaces/${slug}/mcp/`, [origin, slug]);
  // Personal API tokens live under profile settings (the old
  // /:workspaceSlug/settings/api-tokens URL redirects here too).
  const tokensHref = "/settings/profile/api-tokens/";

  const claudeCodeSnippet = `claude mcp add dragon-fruit \\
  --transport http \\
  --url ${mcpUrl} \\
  --header "Authorization: Bearer YOUR_API_TOKEN"`;

  const genericJson = JSON.stringify(
    {
      mcpServers: {
        "dragon-fruit": {
          url: mcpUrl,
          transport: "streamable-http",
          headers: { Authorization: "Bearer YOUR_API_TOKEN" },
        },
      },
    },
    null,
    2
  );

  const curlProbe = `curl -s ${mcpUrl} | jq .`;

  return (
    <SettingsContentWrapper header={<MCPWorkspaceSettingsHeader />}>
      <div className="w-full max-w-3xl">
        <SettingsHeading
          title="MCP — Model Context Protocol"
          description={
            <span>
              MCP is the standard protocol AI tools use to talk to each other. DragonFruit speaks it in both directions
              — and each direction has its own home in Settings.
            </span>
          }
        />

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-subtle bg-layer-1 p-3">
            <h4 className="text-caption-md-medium text-primary">Give Atlas tools from external services</h4>
            <p className="text-caption-sm mt-0.5 text-tertiary">
              Connect GitHub, Linear, Stripe, and more so Atlas can use them in docs, chat, and automations. Managed on{" "}
              <Link href={`/${slug}/settings/integrations/`} className="text-accent-primary hover:underline">
                Settings → Integrations
              </Link>
              .
            </p>
          </div>
          <div className="rounded-lg border border-subtle bg-layer-1 p-3">
            <h4 className="text-caption-md-medium text-primary">Connect external AI clients into DragonFruit</h4>
            <p className="text-caption-sm mt-0.5 text-tertiary">
              Point Claude Code, Cursor, or ChatGPT at this workspace's MCP endpoint so they can read and write tasks
              and docs here. That's this page — setup below.
            </p>
          </div>
        </div>

        <Section
          title="1 · Connect external AI clients to this workspace"
          subtitle="DragonFruit acts as the MCP server. Any MCP-capable AI client can read and write tasks, comments, and docs here."
        >
          <Step n={1} label="Your workspace's MCP endpoint">
            <CodeBlock code={mcpUrl} label="MCP URL" />
            <p className="text-caption-md mt-1.5 text-tertiary">
              The URL is workspace-scoped — each workspace gets its own. GET returns a public manifest (curl-friendly)
              so you can verify the endpoint is live without auth:
            </p>
            <div className="mt-1.5">
              <CodeBlock code={curlProbe} />
            </div>
          </Step>

          <Step n={2} label="Mint an API token">
            <p className="text-caption-md text-secondary">
              Every MCP request authenticates with a personal API token. Create one right here, or manage them all under{" "}
              <Link
                href={tokensHref}
                className="decoration-tertiary inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
              >
                Settings → API Tokens
                <ExternalLink className="size-3" />
              </Link>
              . The token's owning user determines who writes from the MCP client are attributed to — use a dedicated
              bot user if you want agent-style attribution.
            </p>
            <div className="mt-2">
              <ApiTokensPanel />
            </div>
          </Step>

          <Step n={3} label="Configure your MCP client">
            <p className="text-caption-md mb-1.5 text-secondary">Claude Code (CLI):</p>
            <CodeBlock code={claudeCodeSnippet} label="Claude Code config" />

            <p className="text-caption-md mt-3 mb-1.5 text-secondary">Cursor / ChatGPT desktop / generic config:</p>
            <CodeBlock code={genericJson} label="MCP client config" />

            <p className="text-caption-md mt-3 text-tertiary">
              Both <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">Authorization: Bearer …</code>{" "}
              and <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">X-Api-Key: …</code> headers work
              — pick whichever your client supports natively.
            </p>
          </Step>

          <div className="mt-4 rounded-lg border border-subtle bg-layer-1 p-3">
            <h4 className="mb-1.5 text-caption-md-medium text-primary">Tools exposed ({SERVER_TOOLS.length})</h4>
            <ul className="flex flex-col gap-1.5">
              {SERVER_TOOLS.map((t) => (
                <li key={t.name} className="text-caption-sm text-secondary">
                  <code className="font-mono text-caption-sm mr-2 rounded bg-layer-3 px-1.5 py-0.5 text-primary">
                    {t.name}
                  </code>
                  <span className="text-tertiary">{t.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section
          title="2 · Give Atlas tools from other services"
          subtitle="DragonFruit acts as the MCP client. Atlas can use one or more external MCP servers; their tools merge into Atlas's toolbelt at dispatch time."
          className="mt-8"
        >
          <p className="text-caption-md text-secondary">
            The easiest path is{" "}
            <Link
              href={`/${slug}/settings/integrations/`}
              className="decoration-tertiary inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
            >
              Settings → Integrations
              <ExternalLink className="size-3" />
            </Link>{" "}
            — a curated catalog of remote MCP servers (GitHub, Linear, Stripe, PostHog, and more) you can connect with
            one click and, where needed, an API key. Atlas's model and provider key live in{" "}
            <Link
              href={`/${slug}/settings/ai/`}
              className="decoration-tertiary inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
            >
              Settings → AI
              <ExternalLink className="size-3" />
            </Link>
            .
          </p>

          <p className="text-caption-md mt-2 text-secondary">
            Under the hood each connection is an entry on the Atlas profile with a{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">name</code>,{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">url</code>, and an optional{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">auth_header</code> (Fernet-encrypted
            at rest), so the tools follow Atlas across docs, chat, tasks, and automations. Anything that speaks
            MCP-over-HTTP with Bearer or no auth works — custom or self-hosted servers can be attached the same way via
            the API. The protocol spec is at{" "}
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-primary"
            >
              modelcontextprotocol.io
            </a>
            .
          </p>

          <p className="text-caption-md mt-2 text-secondary">
            Tools from each server appear in Atlas's toolbelt prefixed with the server's name (e.g.{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">github__list_issues</code>) so you can
            run multiple servers side-by-side without collisions. If a server is unreachable at dispatch time, Atlas
            silently falls back to its built-in tools — one broken integration doesn't kill the run.
          </p>
        </Section>

        <Section title="Security notes" subtitle="" className="mt-8">
          <ul className="text-caption-md flex list-disc flex-col gap-1.5 pl-5 text-secondary marker:text-tertiary">
            <li>
              API tokens carry the permissions of their owning user. Use a dedicated bot user (with the minimum role
              needed) rather than your own account.
            </li>
            <li>
              The MCP server URL is workspace-scoped; a token scoped to workspace A can't reach workspace B's endpoint
              even if you point a client at it.
            </li>
            <li>
              Auth headers configured on Atlas for outgoing MCP calls are stored Fernet-encrypted — ciphertext is never
              returned by the API (you'll only see{" "}
              <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">has_auth_header: true</code>).
            </li>
            <li>
              When you rotate or revoke an API token (Settings → API Tokens), any MCP client using it loses access
              immediately.
            </li>
          </ul>
        </Section>
      </div>
    </SettingsContentWrapper>
  );
}

function Section({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mt-6 flex flex-col gap-3", className)}>
      <div>
        <h3 className="text-body-sm-medium text-primary">{title}</h3>
        {subtitle && <p className="text-caption-sm mt-0.5 text-tertiary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 flex gap-3">
      <div className="grid size-6 shrink-0 place-items-center rounded-full bg-layer-2 text-caption-sm-medium text-secondary">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-caption-md-medium text-primary">{label}</div>
        {children}
      </div>
    </div>
  );
}

export default MCPSettingsPage;
