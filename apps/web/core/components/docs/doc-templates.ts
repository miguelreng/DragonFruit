/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, SVGProps } from "react";
import { Briefcase, GitBranch, PenTool, Rocket } from "@/components/icons/lucide-shim";

/**
 * Built-in starter templates for the "New doc" gallery.
 *
 * These live entirely in the frontend: a template is just a chunk of starter
 * HTML. When a doc is created with `description_html` set, the client-side
 * editor fallback (use-page-fallback) seeds the Yjs document from that HTML on
 * first open — so no backend/template-table changes are needed.
 */

export type TDocTemplateCategory = "legal" | "dev" | "product" | "content";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export type TDocTemplateCategoryMeta = {
  key: TDocTemplateCategory;
  label: string;
  Icon: IconType;
};

export const DOC_TEMPLATE_CATEGORIES: TDocTemplateCategoryMeta[] = [
  { key: "legal", label: "Legal", Icon: Briefcase },
  { key: "dev", label: "Dev", Icon: GitBranch },
  { key: "product", label: "Product", Icon: Rocket },
  { key: "content", label: "Content", Icon: PenTool },
];

/** Decimal emoji codepoints kept per category — reliable in the emoji picker. */
const CATEGORY_EMOJI: Record<TDocTemplateCategory, string> = {
  legal: "128196", // 📄
  dev: "128187", // 💻
  product: "128640", // 🚀
  content: "128221", // 📝
};

export type TDocTemplate = {
  id: string;
  category: TDocTemplateCategory;
  title: string;
  subtitle: string;
  descriptionHtml: string;
};

export const DOC_TEMPLATES: TDocTemplate[] = [
  // ---- Legal ----
  {
    id: "nda",
    category: "legal",
    title: "NDA",
    subtitle: "Mutual non-disclosure",
    descriptionHtml: `<h1>Mutual non-disclosure agreement</h1>
<p>This agreement is made between <strong>[Party A]</strong> and <strong>[Party B]</strong> as of [date].</p>
<h2>1. Confidential information</h2>
<p>Define what counts as confidential — business plans, technical data, customer lists, and anything marked confidential or that a reasonable person would treat as such.</p>
<h2>2. Obligations</h2>
<ul><li>Use the information only for the stated purpose.</li><li>Do not disclose it to third parties without written consent.</li><li>Protect it with the same care used for your own confidential information.</li></ul>
<h2>3. Exclusions</h2>
<p>Information that is public, independently developed, or lawfully received from a third party is excluded.</p>
<h2>4. Term</h2>
<p>This agreement remains in effect for [number] years from the effective date.</p>
<h2>5. Signatures</h2>
<p>Party A: ____________________ &nbsp; Date: __________</p>
<p>Party B: ____________________ &nbsp; Date: __________</p>`,
  },
  {
    id: "services-agreement",
    category: "legal",
    title: "Services agreement",
    subtitle: "Master services contract",
    descriptionHtml: `<h1>Master services agreement</h1>
<p>Between <strong>[Client]</strong> and <strong>[Provider]</strong>, effective [date].</p>
<h2>1. Scope of services</h2>
<p>Describe the services to be provided. Reference individual statements of work (SOWs) for specifics.</p>
<h2>2. Fees and payment</h2>
<ul><li>Rate: [amount]</li><li>Invoicing: [cadence]</li><li>Payment terms: net [days]</li></ul>
<h2>3. Term and termination</h2>
<p>Initial term, renewal, and the notice period for termination.</p>
<h2>4. Intellectual property</h2>
<p>Who owns deliverables, pre-existing IP, and licensed materials.</p>
<h2>5. Liability and indemnification</h2>
<p>Limitation of liability and indemnity obligations.</p>
<h2>6. Governing law</h2>
<p>This agreement is governed by the laws of [jurisdiction].</p>`,
  },
  {
    id: "privacy-policy",
    category: "legal",
    title: "Privacy policy",
    subtitle: "How you handle user data",
    descriptionHtml: `<h1>Privacy policy</h1>
<p>Last updated: [date]</p>
<h2>What we collect</h2>
<ul><li>Account information</li><li>Usage data</li><li>Device and log data</li></ul>
<h2>How we use it</h2>
<p>Explain the purposes: providing the service, improving it, communication, and legal compliance.</p>
<h2>Sharing</h2>
<p>Describe when and with whom data is shared — service providers, legal requests, business transfers.</p>
<h2>Your rights</h2>
<p>Access, correction, deletion, and how users can exercise them.</p>
<h2>Contact</h2>
<p>Reach us at [email] with any privacy questions.</p>`,
  },
  {
    id: "terms-of-service",
    category: "legal",
    title: "Terms of service",
    subtitle: "Product terms and conditions",
    descriptionHtml: `<h1>Terms of service</h1>
<p>Effective [date]</p>
<h2>1. Acceptance</h2>
<p>By using [product], you agree to these terms.</p>
<h2>2. Accounts</h2>
<p>Eligibility, account security, and responsibility for activity.</p>
<h2>3. Acceptable use</h2>
<ul><li>No unlawful activity</li><li>No abuse or interference with the service</li><li>No infringement of others' rights</li></ul>
<h2>4. Payment</h2>
<p>Subscription fees, billing, and refunds.</p>
<h2>5. Termination</h2>
<p>When and how accounts may be suspended or terminated.</p>
<h2>6. Disclaimers and limitation of liability</h2>
<p>Service provided "as is"; limits on liability.</p>`,
  },

  // ---- Dev ----
  {
    id: "tech-design",
    category: "dev",
    title: "Technical design doc",
    subtitle: "Architecture and approach",
    descriptionHtml: `<h1>Technical design: [title]</h1>
<p><strong>Author:</strong> [name] &nbsp; <strong>Status:</strong> Draft &nbsp; <strong>Reviewers:</strong> [names]</p>
<h2>Summary</h2>
<p>One paragraph: what are we building and why.</p>
<h2>Background and motivation</h2>
<p>The problem, current state, and why it matters now.</p>
<h2>Goals and non-goals</h2>
<ul><li>Goal: …</li><li>Non-goal: …</li></ul>
<h2>Proposed design</h2>
<p>Architecture, data model, APIs, and key components. Include diagrams where helpful.</p>
<h2>Alternatives considered</h2>
<p>What else was evaluated and why it was rejected.</p>
<h2>Rollout and risks</h2>
<ul><li>Migration plan</li><li>Monitoring and metrics</li><li>Risks and mitigations</li></ul>
<h2>Open questions</h2>
<ul><li>…</li></ul>`,
  },
  {
    id: "rfc",
    category: "dev",
    title: "RFC",
    subtitle: "Request for comments",
    descriptionHtml: `<h1>RFC: [title]</h1>
<p><strong>Status:</strong> Proposed &nbsp; <strong>Author:</strong> [name] &nbsp; <strong>Date:</strong> [date]</p>
<h2>Problem</h2>
<p>What needs to change and why.</p>
<h2>Proposal</h2>
<p>The concrete change being proposed.</p>
<h2>Detailed design</h2>
<p>How it works, including edge cases.</p>
<h2>Drawbacks</h2>
<p>Costs and downsides of this approach.</p>
<h2>Unresolved questions</h2>
<ul><li>…</li></ul>`,
  },
  {
    id: "runbook",
    category: "dev",
    title: "Runbook",
    subtitle: "Operational procedure",
    descriptionHtml: `<h1>Runbook: [service / task]</h1>
<h2>Overview</h2>
<p>What this runbook covers and when to use it.</p>
<h2>Prerequisites</h2>
<ul><li>Access needed</li><li>Tools required</li></ul>
<h2>Procedure</h2>
<ol><li>Step one</li><li>Step two</li><li>Step three</li></ol>
<h2>Verification</h2>
<p>How to confirm the task succeeded.</p>
<h2>Rollback</h2>
<p>How to undo the change if something goes wrong.</p>
<h2>Escalation</h2>
<p>Who to contact and how, if the procedure fails.</p>`,
  },
  {
    id: "postmortem",
    category: "dev",
    title: "Postmortem",
    subtitle: "Incident retrospective",
    descriptionHtml: `<h1>Postmortem: [incident]</h1>
<p><strong>Date:</strong> [date] &nbsp; <strong>Severity:</strong> [level] &nbsp; <strong>Duration:</strong> [time]</p>
<h2>Summary</h2>
<p>What happened, in two or three sentences.</p>
<h2>Impact</h2>
<p>Who and what was affected, and for how long.</p>
<h2>Timeline</h2>
<ul><li>[time] — detection</li><li>[time] — mitigation</li><li>[time] — resolution</li></ul>
<h2>Root cause</h2>
<p>The underlying cause, not just the symptom.</p>
<h2>What went well / what didn't</h2>
<ul><li>Went well: …</li><li>Didn't: …</li></ul>
<h2>Action items</h2>
<ul><li>[ ] Owner — action — due date</li></ul>`,
  },

  // ---- Product ----
  {
    id: "prd",
    category: "product",
    title: "PRD",
    subtitle: "Product requirements",
    descriptionHtml: `<h1>PRD: [feature]</h1>
<p><strong>Author:</strong> [name] &nbsp; <strong>Status:</strong> Draft &nbsp; <strong>Target:</strong> [release]</p>
<h2>Problem</h2>
<p>What user problem are we solving? Include evidence.</p>
<h2>Objective and success metrics</h2>
<ul><li>Objective: …</li><li>Metric: …</li></ul>
<h2>Users and use cases</h2>
<p>Who this is for and the key scenarios.</p>
<h2>Requirements</h2>
<ul><li>Must have: …</li><li>Nice to have: …</li></ul>
<h2>Out of scope</h2>
<p>What we're explicitly not doing.</p>
<h2>Open questions</h2>
<ul><li>…</li></ul>`,
  },
  {
    id: "feature-spec",
    category: "product",
    title: "Feature spec",
    subtitle: "Detailed feature spec",
    descriptionHtml: `<h1>Feature spec: [name]</h1>
<h2>Overview</h2>
<p>A short description of the feature and its value.</p>
<h2>User flow</h2>
<ol><li>Entry point</li><li>Main interaction</li><li>Success state</li></ol>
<h2>Functional requirements</h2>
<ul><li>…</li></ul>
<h2>Edge cases and errors</h2>
<ul><li>Empty state</li><li>Error state</li><li>Permissions</li></ul>
<h2>Analytics</h2>
<p>Events to track and why.</p>`,
  },
  {
    id: "roadmap",
    category: "product",
    title: "Roadmap",
    subtitle: "Quarterly plan",
    descriptionHtml: `<h1>Roadmap: [quarter / year]</h1>
<h2>Themes</h2>
<p>The two or three big bets for this period.</p>
<h2>Now</h2>
<ul><li>Initiative — owner — status</li></ul>
<h2>Next</h2>
<ul><li>Initiative — owner</li></ul>
<h2>Later</h2>
<ul><li>Idea under consideration</li></ul>
<h2>Not doing</h2>
<p>What we're deliberately deferring.</p>`,
  },
  {
    id: "user-research",
    category: "product",
    title: "User research",
    subtitle: "Interview notes and synthesis",
    descriptionHtml: `<h1>User research: [study]</h1>
<p><strong>Method:</strong> [interviews / survey] &nbsp; <strong>Participants:</strong> [n] &nbsp; <strong>Date:</strong> [date]</p>
<h2>Goals</h2>
<p>What we set out to learn.</p>
<h2>Key findings</h2>
<ul><li>Finding — supporting quote</li></ul>
<h2>Themes</h2>
<p>Patterns across participants.</p>
<h2>Recommendations</h2>
<ul><li>…</li></ul>
<h2>Raw notes</h2>
<p>Per-participant notes go here.</p>`,
  },

  // ---- Content ----
  {
    id: "blog-post",
    category: "content",
    title: "Blog post",
    subtitle: "Draft with outline",
    descriptionHtml: `<h1>[Working title]</h1>
<p><em>One-line hook that makes the reader want to keep going.</em></p>
<h2>Introduction</h2>
<p>Set up the problem or promise. Why should the reader care?</p>
<h2>Section one</h2>
<p>Main point, backed by an example or data.</p>
<h2>Section two</h2>
<p>Next point.</p>
<h2>Conclusion</h2>
<p>Wrap up and end with a call to action.</p>
<hr>
<p><strong>SEO title:</strong> … &nbsp; <strong>Meta description:</strong> …</p>`,
  },
  {
    id: "release-notes",
    category: "content",
    title: "Release notes",
    subtitle: "What's new",
    descriptionHtml: `<h1>Release notes — [version]</h1>
<p>[date]</p>
<h2>✨ New</h2>
<ul><li>…</li></ul>
<h2>🐛 Fixed</h2>
<ul><li>…</li></ul>
<h2>⚡ Improved</h2>
<ul><li>…</li></ul>
<h2>⚠️ Breaking changes</h2>
<ul><li>…</li></ul>`,
  },
  {
    id: "newsletter",
    category: "content",
    title: "Newsletter",
    subtitle: "Email update",
    descriptionHtml: `<h1>[Newsletter name] — [issue]</h1>
<p>Hi [audience],</p>
<h2>In this issue</h2>
<ul><li>…</li><li>…</li></ul>
<h2>The main story</h2>
<p>Lead with the most valuable thing this issue.</p>
<h2>Quick hits</h2>
<ul><li>Link — one line on why it matters</li></ul>
<h2>Until next time</h2>
<p>Sign-off and a clear call to action.</p>`,
  },
  {
    id: "case-study",
    category: "content",
    title: "Case study",
    subtitle: "Customer story",
    descriptionHtml: `<h1>Case study: [customer]</h1>
<blockquote>A standout quote from the customer.</blockquote>
<h2>About [customer]</h2>
<p>Industry, size, and what they do.</p>
<h2>The challenge</h2>
<p>The problem they faced before your product.</p>
<h2>The solution</h2>
<p>How they used your product to solve it.</p>
<h2>Results</h2>
<ul><li>Metric — before → after</li></ul>`,
  },
];

/** logo_props for a template's created page, using the category emoji. */
export const getTemplateLogoProps = (template: TDocTemplate) => ({
  in_use: "emoji" as const,
  emoji: { value: CATEGORY_EMOJI[template.category] },
});
