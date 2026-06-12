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

import type { ComponentType } from "react";
// constants
import {
  GitHubLogo,
  HuggingFaceLogo,
  LinearLogo,
  MicrosoftLogo,
  PostHogLogo,
  StripeLogo,
} from "@/constants/integration-logos";

export type TIntegrationAuthType = "none" | "api_key";

export type TIntegrationCategory = "dev" | "data" | "docs" | "payments" | "analytics" | "automation";

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
  /** Tile accent (used for the lettermark when there's no logo). */
  accent: string;
  /** Inline-SVG brand mark. Entries without one fall back to the accent lettermark. */
  logo?: ComponentType<{ className?: string }>;
  /** For api_key integrations: label + where to get the key. */
  keyLabel?: string;
  keyHelpUrl?: string;
  docsUrl?: string;
};

// NOTE: the worker sends `api_key` values as `Authorization: Bearer <key>`
// (see apps/api/plane/llm/mcp_client.py) — only list providers whose remote
// MCP endpoint accepts Bearer-header auth (not x-api-key / URL-embedded keys).
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
    logo: GitHubLogo,
    keyLabel: "GitHub personal access token",
    keyHelpUrl: "https://github.com/settings/personal-access-tokens",
  },
  {
    key: "linear",
    name: "Linear",
    description: "Let Atlas find, create, and update issues across your Linear workspace.",
    category: "dev",
    authType: "api_key",
    mcpUrl: "https://mcp.linear.app/mcp",
    capabilities: ["Search, create & update issues", "Browse teams, projects & cycles", "Add comments on issues"],
    accent: "#5E6AD2",
    logo: LinearLogo,
    keyLabel: "Linear personal API key",
    keyHelpUrl: "https://linear.app/settings/account/security",
    docsUrl: "https://linear.app/docs/mcp",
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
    logo: StripeLogo,
    keyLabel: "Stripe restricted API key",
    keyHelpUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    key: "posthog",
    name: "PostHog",
    description: "Query product analytics, feature flags, and experiments in PostHog.",
    category: "analytics",
    authType: "api_key",
    mcpUrl: "https://mcp.posthog.com/mcp",
    capabilities: ["Query insights & trends", "Inspect feature flags & experiments", "Look up error tracking"],
    accent: "#F54E00",
    logo: PostHogLogo,
    keyLabel: "PostHog personal API key",
    keyHelpUrl: "https://app.posthog.com/settings/user-api-keys",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
  },
  {
    key: "firecrawl",
    name: "Firecrawl",
    description: "Scrape, crawl, and search the live web as clean, LLM-ready content.",
    category: "data",
    authType: "api_key",
    mcpUrl: "https://mcp.firecrawl.dev/v2/mcp",
    capabilities: ["Scrape any URL as markdown", "Crawl & map whole sites", "Search the web"],
    accent: "#F97316",
    keyLabel: "Firecrawl API key",
    keyHelpUrl: "https://www.firecrawl.dev/app/api-keys",
    docsUrl: "https://docs.firecrawl.dev/mcp-server",
  },
  {
    key: "apify",
    name: "Apify",
    description: "Run scrapers and automation Actors from the Apify Store.",
    category: "automation",
    authType: "api_key",
    mcpUrl: "https://mcp.apify.com",
    capabilities: [
      "Run scrapers & automation Actors",
      "Extract data from social, maps & e-commerce",
      "Fetch Actor run results",
    ],
    accent: "#0D9488",
    keyLabel: "Apify API token",
    keyHelpUrl: "https://console.apify.com/settings/integrations",
    docsUrl: "https://docs.apify.com/platform/integrations/mcp",
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
    logo: HuggingFaceLogo,
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
  {
    key: "microsoft-learn",
    name: "Microsoft Learn",
    description: "Search official Microsoft, Azure, and .NET documentation and code samples.",
    category: "docs",
    authType: "none",
    mcpUrl: "https://learn.microsoft.com/api/mcp",
    capabilities: [
      "Search Microsoft & Azure docs",
      "Fetch full doc pages",
      "Find official code samples",
      "No key required",
    ],
    accent: "#0078D4",
    logo: MicrosoftLogo,
    docsUrl: "https://learn.microsoft.com/training/support/mcp",
  },
];
