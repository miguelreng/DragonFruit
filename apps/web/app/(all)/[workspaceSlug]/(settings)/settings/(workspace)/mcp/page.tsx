/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// components
import { Copy, ExternalLink } from "@/components/icons/lucide-shim";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// local
import type { Route } from "./+types/page";
import { MCPWorkspaceSettingsHeader } from "./header";

// The 8 tools Dragon Fruit's MCP server exposes today. Kept in sync
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

// MCP servers worth highlighting as good starting points for the
// "agents consume MCP" direction. None of these are endorsements; the
// list is illustrative and easy to expand. Keep URLs short and stable.
const EXAMPLE_MCP_SERVERS: Array<{ name: string; description: string; url: string }> = [
  {
    name: "GitHub (official)",
    description: "Read issues, PRs, file contents; comment on issues; trigger workflows.",
    url: "https://github.com/github/github-mcp-server",
  },
  {
    name: "Slack",
    description: "Send messages, look up users, search channel history.",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
  },
  {
    name: "Linear",
    description: "Read and create issues, list teams and projects.",
    url: "https://github.com/jerhadf/linear-mcp-server",
  },
  {
    name: "Filesystem (local)",
    description: "Run an MCP server locally to expose files on the agent host. Mostly useful for self-hosted setups.",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
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
  const tokensHref = useMemo(() => `/${slug}/settings/api-tokens/`, [slug]);
  const agentsHref = useMemo(() => `/${slug}/settings/agents/`, [slug]);

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
              MCP lets AI tools talk to each other through a standard protocol. Dragon Fruit can play both roles: an MCP
              server that external tools (Claude Code, Cursor, ChatGPT desktop, etc.) connect to, and an MCP client for
              your agents to consume tools from other services (GitHub, Slack, Linear, your own internal MCP servers).
            </span>
          }
        />

        <Section
          title="1 · Connect external AI tools to this workspace"
          subtitle="Dragon Fruit acts as the MCP server. Any MCP-capable AI tool can read and write tasks, comments, and pages here."
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
              Generate a workspace-scoped token under{" "}
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

          <div className="mt-4 rounded-md border border-subtle bg-layer-1 p-3">
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
          title="2 · Give your agents tools from other services"
          subtitle="Dragon Fruit acts as the MCP client. Each agent can be configured with one or more external MCP servers; their tools merge into the agent's toolbelt at dispatch time."
          className="mt-8"
        >
          <p className="text-caption-md text-secondary">
            Open{" "}
            <Link
              href={agentsHref}
              className="decoration-tertiary inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
            >
              Settings → Agents
              <ExternalLink className="size-3" />
            </Link>{" "}
            and pick an agent. On its detail panel you can add MCP servers with{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">name</code>,{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">url</code>, and an optional{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">auth_header</code> (Fernet-encrypted
            at rest).
          </p>

          <p className="text-caption-md mt-2 text-secondary">
            Tools from each server appear in the agent's toolbelt prefixed with the server's name (e.g.{" "}
            <code className="font-mono rounded bg-layer-3 px-1 py-px text-[10px]">github__list_issues</code>) so you can
            run multiple servers side-by-side without collisions. If a server is unreachable at dispatch time, the agent
            silently falls back to its built-in tools — one broken integration doesn't kill the run.
          </p>

          <div className="mt-4 rounded-md border border-subtle bg-layer-1 p-3">
            <h4 className="mb-1.5 text-caption-md-medium text-primary">Example MCP servers worth trying</h4>
            <ul className="flex flex-col gap-2">
              {EXAMPLE_MCP_SERVERS.map((s) => (
                <li key={s.name} className="text-caption-sm">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-caption-md-medium text-primary hover:underline"
                  >
                    {s.name}
                    <ExternalLink className="size-3" />
                  </a>
                  <div className="text-tertiary">{s.description}</div>
                </li>
              ))}
            </ul>
            <p className="text-caption-sm mt-3 text-tertiary">
              Anything that speaks MCP-over-HTTP works. The protocol spec is at{" "}
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
          </div>
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
              Auth headers configured on agents for outgoing MCP calls are stored Fernet-encrypted — ciphertext is never
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
