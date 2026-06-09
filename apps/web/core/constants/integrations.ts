/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The integrations "store" catalog.
 *
 * Each entry is a curated remote MCP server that Atlas can use as a tool
 * source. Connecting an integration just writes an entry onto the workspace
 * agent's `mcp_servers` (see agent.service `setMcpServers`) — the worker then
 * discovers its tools at dispatch time (`_load_mcp_tools_for`). No backend
 * changes are needed for `none` / `api_key` auth.
 *
 * NOTE: confirm each provider's current remote MCP endpoint + auth before
 * relying on it in production — providers move these URLs. OAuth-based
 * providers (token refresh) are intentionally NOT in this Phase-1 list; they
 * need the WorkspaceMCPConnection layer.
 */

export type TIntegrationAuthType = "none" | "api_key";

export type TIntegrationCategory = "dev" | "data" | "docs" | "payments";

export type TIntegration = {
  /** Stable id. Also used as the `mcp_servers` entry name → the tool prefix (`<key>__tool`). */
  key: string;
  name: string;
  description: string;
  category: TIntegrationCategory;
  authType: TIntegrationAuthType;
  /** The remote MCP (JSON-RPC) endpoint the worker calls. */
  mcpUrl: string;
  /** Plain-language list of what Atlas gains. Shown before connecting. */
  capabilities: string[];
  /** Tile accent (used for the lettermark when there's no icon asset). */
  accent: string;
  /** For api_key integrations: label + where to get the key. */
  keyLabel?: string;
  keyHelpUrl?: string;
  docsUrl?: string;
};

export const INTEGRATIONS: TIntegration[] = [
  {
    key: "github",
    name: "GitHub",
    description: "Let Atlas read issues, PRs, and code across your repositories.",
    category: "dev",
    authType: "api_key",
    mcpUrl: "https://api.githubcopilot.com/mcp/",
    capabilities: ["Search & read issues and pull requests", "Browse repository files", "Summarize diffs"],
    accent: "#1F2328",
    keyLabel: "GitHub personal access token",
    keyHelpUrl: "https://github.com/settings/personal-access-tokens",
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Query payments, customers, and subscriptions from your Stripe account.",
    category: "payments",
    authType: "api_key",
    mcpUrl: "https://mcp.stripe.com",
    capabilities: ["Look up customers & charges", "Inspect subscriptions", "Answer billing questions"],
    accent: "#635BFF",
    keyLabel: "Stripe restricted API key",
    keyHelpUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    key: "huggingface",
    name: "Hugging Face",
    description: "Search models, datasets, and Spaces on the Hugging Face Hub.",
    category: "data",
    authType: "api_key",
    mcpUrl: "https://huggingface.co/mcp",
    capabilities: ["Search models & datasets", "Read model cards", "Look up Spaces"],
    accent: "#FF9D00",
    keyLabel: "Hugging Face access token",
    keyHelpUrl: "https://huggingface.co/settings/tokens",
  },
  {
    key: "context7",
    name: "Context7",
    description: "Pull up-to-date, version-specific docs for libraries and frameworks.",
    category: "docs",
    authType: "api_key",
    mcpUrl: "https://mcp.context7.com/mcp",
    capabilities: ["Fetch current library docs", "Resolve package/version", "Reduce hallucinated APIs"],
    accent: "#0EA5E9",
    keyLabel: "Context7 API key",
    keyHelpUrl: "https://context7.com/dashboard",
  },
  {
    key: "deepwiki",
    name: "DeepWiki",
    description: "Ask questions about any public GitHub repository's docs and architecture.",
    category: "docs",
    authType: "none",
    mcpUrl: "https://mcp.deepwiki.com/mcp",
    capabilities: ["Explain a public repo's structure", "Answer 'how does X work' questions", "No key required"],
    accent: "#16A34A",
  },
];
