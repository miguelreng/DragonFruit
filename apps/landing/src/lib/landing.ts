export const conversionPages = [
  {
    href: "/atlas",
    eyebrow: "AI teammate",
    title: "Meet Atlas",
    body: "One teammate for organizing notes, drafting docs, triaging projects, and pausing before risky changes.",
  },
  {
    href: "/use-cases",
    eyebrow: "For your work",
    title: "Use cases",
    body: "How creators, technical teams, and studios use the same room for thinking and execution.",
  },
  {
    href: "/pricing",
    eyebrow: "Transparent",
    title: "Pricing",
    body: "Start free, upgrade for Atlas, and keep AI costs clear with BYOK or managed usage.",
  },
  {
    href: "/open-source",
    eyebrow: "Trust",
    title: "Open source",
    body: "Inspect the code, self-host when control matters, or use Cloud when speed matters.",
  },
];

export const audienceCards = [
  {
    title: "Creators",
    body: "Capture voice notes, sponsor ideas, research clips, and launch plans, then ask Atlas to turn the mess into a useful next step.",
    stat: "Notes to plans",
  },
  {
    title: "Tech teams",
    body: "Keep specs, bugs, decisions, customer notes, and triage in one workspace instead of sending everything through another chat sidebar.",
    stat: "Specs to tasks",
  },
  {
    title: "Creative teams",
    body: "Run campaigns, client work, critique, and handoffs with enough structure to ship and enough quiet to think.",
    stat: "Ideas to delivery",
  },
  {
    title: "Self-host builders",
    body: "Bring your own model key, keep costs visible, and own the workspace that stores your projects, docs, and AI context.",
    stat: "BYOK + source",
  },
];

export const bentoFeatures = [
  {
    title: "Write the thought.",
    body: "Start with a note, transcript, research clip, or half-formed plan. DragonFruit keeps the thinking close to the work.",
    meta: "Tasks + docs",
    size: "large",
  },
  {
    title: "Ask Atlas.",
    body: "Atlas reads the surrounding docs and tasks, then organizes, drafts, summarizes, or prepares changes in context.",
    meta: "AI teammate",
    size: "tall",
  },
  {
    title: "Approve the change.",
    body: "Atlas can prepare real work, but anything risky waits for a human yes.",
    meta: "Control",
    size: "small",
  },
  {
    title: "Bring your key.",
    body: "Use the AI provider you trust and keep model costs visible.",
    meta: "BYOK",
    size: "small",
  },
  {
    title: "Self-host or use Cloud.",
    body: "The code is open. Run it yourself when control matters, or use hosted DragonFruit when you want momentum.",
    meta: "AGPL",
    size: "wide",
  },
];

export const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    priceDetail: "forever",
    body: "A solo workspace for simple tasks and docs.",
    items: ["1 user", "Tasks + docs", "No Atlas on Cloud", "Self-host path stays open"],
  },
  {
    name: "Pro",
    price: "$12",
    priceDetail: "user / month",
    body: "For creators, builders, and small teams that want Atlas in the daily workflow.",
    items: ["Full Atlas", "Bring your own key", "Automations and connectors as they ship", "14-day trial"],
  },
  {
    name: "Business",
    price: "$24",
    priceDetail: "user / month",
    body: "For teams that need stronger controls around identity, support, and governance.",
    items: ["Everything in Pro", "SSO/SAML", "Audit logs", "SLA and priority support"],
  },
  {
    name: "Atlas Cloud",
    price: "Usage",
    priceDetail: "about 1.4x model cost",
    body: "Optional managed LLM usage for teams that do not want to manage their own provider key.",
    items: ["No key setup", "Usage metering", "Spend caps", "Admin visibility"],
  },
];
