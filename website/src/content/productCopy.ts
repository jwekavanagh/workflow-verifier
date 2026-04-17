/** Single source for homepage, pricing recap, sign-in framing, and test ids. */

import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";

export type InternalHref = "/security" | "/support" | "/pricing" | "/privacy" | "/terms" | "/integrate";

export type PricingTrustBandBeforeGrid = {
  title: string;
  paragraphs: readonly [string, string];
  links: readonly [{ label: string; href: "/security" }, { label: string; href: "/support" }];
};

export type SecurityQuickFacts = {
  title: string;
  bullets: readonly [string, string, string, string];
};

export type SupportPage = {
  h1: string;
  intro: string;
  sections: readonly [
    {
      kind: "supportIssues";
      h2: string;
      paragraph: string;
      issuesLinkLabel: string;
    },
    {
      kind: "buying";
      h2: string;
      paragraph: string;
      cta: { label: string; href: "/pricing" };
    },
    {
      kind: "legal";
      h2: string;
      links: readonly [
        { label: string; href: "/security" },
        { label: string; href: "/privacy" },
        { label: string; href: "/terms" },
      ];
    },
    {
      kind: "artifacts";
      h2: string;
      items: readonly [{ label: string; key: "source" }, { label: string; key: "npm" }];
    },
  ];
};

export type SupportPageMetadata = { title: string; description: string };

export type LearnBundledProofLedes = { primary: string; secondaryMuted: string };

export type HomeHeroCtaLabels = { demo: string };

/** Hero primary CTA — scrolls to bundled Try it. */
export const HOME_HERO_DEMO_CTA_LABEL = "Run the bundled demo" as const;

/** Section repeat CTAs — same anchor, different copy so the page does not read template-driven. */
export const HOME_SCROLL_TO_TRY_CTA_LABEL = "Jump to Try it" as const;

/** Try-it control — performs POST /api/demo/verify (distinct from scroll CTAs). */
export const HOME_TRY_IT_RUN_BUTTON_LABEL = "Run sample verification" as const;

export const supportPageMetadata = {
  title: "Support and procurement — AgentSkeptic",
  description:
    "How to get support, Enterprise procurement, and links to legal and security documentation.",
} as const satisfies SupportPageMetadata;

export const supportPage = {
  h1: "Support and procurement",
  intro:
    "AgentSkeptic is the commercial product surface for a read-only SQL verification engine shipped as open source from the same repository.",
  sections: [
    {
      kind: "supportIssues" as const,
      h2: "Support and issues",
      paragraph:
        "For product defects, integration questions, and reproducible bugs, use GitHub Issues on the public repository. That is the default support channel.",
      issuesLinkLabel: "Open GitHub Issues",
    },
    {
      kind: "buying" as const,
      h2: "Buying and Enterprise",
      paragraph:
        "Self-serve plans and Stripe checkout are on Pricing. Enterprise procurement uses Contact sales on the Enterprise pricing card—this page does not publish a sales email address.",
      cta: { label: "Go to Pricing", href: "/pricing" as const },
    },
    {
      kind: "legal" as const,
      h2: "Legal and security",
      links: [
        { label: "Security & Trust", href: "/security" as const },
        { label: "Privacy", href: "/privacy" as const },
        { label: "Terms", href: "/terms" as const },
      ],
    },
    {
      kind: "artifacts" as const,
      h2: "Product artifacts",
      items: [
        { label: "Source", key: "source" as const },
        { label: "npm", key: "npm" as const },
      ],
    },
  ],
} as const satisfies SupportPage;

export const learnBundledProofLedes = {
  primary:
    "These pages show real verification envelopes for bundled workflows so you can see verified versus ROW_ABSENT outcomes without running the CLI.",
  secondaryMuted:
    "They are indexable public examples. Private paste links use /r/ and stay noindex by design.",
} as const satisfies LearnBundledProofLedes;

/** Bundled proof section on `/guides`: visible text split around the `/integrate` link. */
export const learnBundledProofIntegrateLede = {
  before: "For first-run on your database, follow ",
  after: " for Postgres or SQLite setup, registry shape, and CLI commands.",
} as const;

export const pricingTrustBandBeforeGrid = {
  title: "Billing and plan changes",
  paragraphs: [
    "Subscribe with Stripe Checkout; manage cards, invoices, and upgrades from Account. Upgrade tiers as usage grows.",
    "Enterprise: use Contact sales on the Enterprise card for procurement, custom limits, or contract terms—do not use unpublished sales inboxes.",
  ],
  links: [
    { label: "Security & Trust", href: "/security" as const },
    { label: "Support", href: "/support" as const },
  ],
} as const satisfies PricingTrustBandBeforeGrid;

/** Above-the-fold `/pricing` hero (title, stakes, subhead). */
export const pricingHero = {
  title: "Pricing for database truth verification",
  positioning: "Stop shipping workflows that look successful but write incorrect data.",
  subtitle: "Start free. Pay when you need CI enforcement and production-scale verification.",
} as const;

export const pricingHeroExample = {
  title: "What you are buying",
  bullets: [
    "A workflow writes status = resolved.",
    "AgentSkeptic verifies that row in CI before deploy.",
    "If the database does not match, the build fails.",
  ],
} as const;

export const pricingRiskReassurance =
  "Cancel anytime. Local verification stays free.";

/** `/pricing` Starter card: `includedMonthly` is 0 (evaluation; no paid CLI allowance). */
export const pricingCardStarterPaidQuotaCaption =
  "No paid CLI quota—subscribe on Individual, Team, or Business for included monthly verifications.";

export const pricingFeatureComparison = {
  title: "Compare plans in detail",
  columnLabels: ["Capability", "Starter", "Individual", "Team", "Business", "Enterprise"] as const,
  rows: [
    {
      feature: "Verify locally (no paid subscription)",
      starter: "Yes",
      individual: "Yes",
      team: "Yes",
      business: "Yes",
      enterprise: "Yes",
    },
    {
      feature: "Fail build on mismatch",
      starter: "No",
      individual: "Yes",
      team: "Yes",
      business: "Yes",
      enterprise: "Yes",
    },
    {
      feature: "Run verification from CI with API access",
      starter: "No",
      individual: "Yes",
      team: "Yes",
      business: "Yes",
      enterprise: "Yes",
    },
    {
      feature: "Included verifications per month (paid CLI)",
      starter: "None (subscribe for quota)",
      individual: "2,000",
      team: "10,000",
      business: "50,000",
      enterprise: "Custom",
    },
    {
      feature:
        "OSS CLI: generate `--output-lock` fixtures without a subscription (lock generation only; compare / enforce need commercial)",
      starter: "Yes",
      individual: "Yes",
      team: "Yes",
      business: "Yes",
      enterprise: "Yes",
    },
  ],
} as const;

/** Truthful guidance without implying existing customer mix. */
export const pricingRecommendedPill = "For production CI";

/** Microcopy under Team card (upgrade trigger for shared CI). */
export const pricingTeamFootnote = "Upgrade when you enable CI enforcement.";

/** Primary CTA labels on `/pricing` cards (sign-in still required before checkout). */
export const pricingPlanCtas = {
  starter: { href: "/integrate" as const, label: "Start free" },
  individual: { signInLabel: "Get API key", checkoutLabel: "Continue to checkout" },
  team: { signInLabel: "Start using CI enforcement", checkoutLabel: "Continue to checkout" },
  business: { signInLabel: "Scale across services", checkoutLabel: "Continue to checkout" },
  enterprise: { label: "Contact sales" },
} as const;

export const securityQuickFacts = {
  title: "Quick facts for buyers",
  bullets: [
    "CLI and verification engine run in your infrastructure against databases you configure; the homepage demo runs bundled fixtures on this server for evaluation only.",
    "Structured tool activity is compared to database query results at verification time; that check does not prove a specific network call caused a row.",
    "Accounts on this site use email magic links; paid plans use Stripe; see Privacy and Terms for site-side data handling.",
    "Treat the repository SSOT documents linked on Security & Trust as authoritative for semantics and commercial limits.",
  ],
} as const satisfies SecurityQuickFacts;

/** Static copy for `/integrate` activation (no embedded docs on this route). */
export const integrateActivation = {
  whyHeading: "Why this matters",
  whyParagraphs: [
    "Traces can look successful while the database is wrong—missing rows, wrong values, or writes that never landed.",
    "AgentSkeptic runs read-only SQL at verification time and compares what actually exists with what your tools reported they did, so you get database truth instead of narrative or trace color alone.",
  ],
  icp: "If you build workflows, agents, or systems that write to a database, this shows end to end how verification compares declared tool activity to the database state that actually exists.",
  requirementsHeading: "You need",
  requirements: ["Node.js 22.13 or newer", "Git", "npm"],
  hypothesisLabel: "Verification hypothesis (one line)",
  hypothesisHelper:
    "State the database mismatch you are checking for. Allowed: ASCII printable except single or double quotes; length 1–240 after trim. Required before Copy.",
  hypothesisInvalid: "Enter 1–240 allowed characters (ASCII printable; no quotes).",
  copyActivationBlockLabel: "Copy activation commands",
  runHeading: "Run this",
  runCaption:
    "Enter your hypothesis, then copy the block below into a terminal. Wait through install, build, the bundled demo, and first-run verify. A cold clone can take several minutes and may surface typical Node or network friction.",
  successHeading: "What success looks like",
  successIntro:
    "When it works, you will see proof from both the human report and the machine-readable result.",
  successBullets: [
    "Stderr includes the human verification report, with wording that the run matched the database.",
    'Stdout is one JSON object with "status":"complete" and at least one step marked verified. Treat that JSON as authoritative for pass/fail; you may also see a trailing line such as first-run-verify: ok (sqlite), which is a convenience transcript, not a second contract.',
    "If stderr mentions an experimental SQLite feature in Node, you can ignore that line for pass/fail.",
  ],
  provedHeading: "What you just proved",
  proved:
    "You ran the bundled demo (npm start), then first-run verify (npm run first-run-verify): read-only SQL against a temp database file, registry-backed expectations, terminal JSON on stdout, and the human report on stderr—not Quick Verify inference alone.",
  nextHeading: "Next: your system",
  nextLead:
    "To repeat this on your data you need three concrete artifacts: a database connection (URL you trust for read-only checks), a structured events file (for example NDJSON of tool activity from your agents), and a registry file (for example tools.json) that maps each tool name to read-only SQL expectations. The first-run doc walks through wiring them into the same CLI.",
  nextSteps: [
    {
      title: "Continue: first-run integration (SSOT)",
      body: "Step 3: use agentskeptic bootstrap when you have OpenAI-style tool_calls JSON and a DB URL—see the linked doc.",
      href: "https://github.com/jwekavanagh/agentskeptic/blob/main/docs/first-run-integration.md",
      linkLabel: "Open first-run-integration.md",
    },
    {
      title: "Optional: registry draft (model-assisted)",
      body: "Same-origin POST for a copy-only draft registry; not contract verification. Full contract in the linked SSOT.",
      href: "https://github.com/jwekavanagh/agentskeptic/blob/main/docs/registry-draft-ssot.md",
      linkLabel: "Open registry-draft-ssot.md",
    },
  ],
} as const;

const integrateRegistryDraftExampleBody = {
  inputKind: "openai_tool_calls_v1" as const,
  schemaVersion: 1 as const,
  workflowId: "wf_bootstrap_fixture",
  tool_calls: [
    {
      id: "call_fixture_1",
      type: "function" as const,
      function: {
        name: "crm.upsert_contact",
        arguments: '{"recordId":"c_ok","fields":{"name":"Alice","status":"active"}}',
      },
    },
  ],
};

/** Optional same-origin registry draft on `/integrate` (see docs/registry-draft-ssot.md). */
export const integrateRegistryDraft = {
  /** Shown as the `<summary>` when this panel is collapsed under the activation spine on `/integrate`. */
  optionalSectionSummary: "Optional: registry draft (model-assisted, same-origin)",
  sectionHeading: "Registry draft helper (optional)",
  paragraphs: [
    "If you have OpenAI-style tool_calls, you can POST JSON here for a copy-only draft registry—autocomplete for wiring, not a verification run. Full contract: docs/registry-draft-ssot.md.",
  ],
  bullets: ["You edit, review, and keep the registry locally; nothing auto-applies to your systems."],
  technicalSummary: "Request contract, limits, and server flow",
  technicalFlowBullets: [
    "POST JSON is validated against the published request contract; a hosted model returns validated draft tool entries for you to copy. Requests are not stored after the response.",
  ],
  technicalBullets: [
    "Same-origin only (Origin or Referer must be this site). Body is bootstrap-shaped JSON or a minimal tool_calls array; optional ddlHint is plain text without ://; feature off returns HTTP 404.",
  ],
  requestLabel: "Request body (JSON)",
  submitLabel: "Request draft",
  /** Shown above the draft JSON when the API returns validated JSON. */
  resultSuccessLead:
    "The server returned a validated draft registry. Review it before use—this is a draft, not a verification result—then copy the JSON into your repo.",
  copyDraftJsonLabel: "Copy draft JSON",
  copiedDraftJsonFeedback: "Copied",
  draftJsonOutputLabel: "Draft registry JSON (read-only)",
  exampleJson: JSON.stringify(integrateRegistryDraftExampleBody),
} as const;

export const homeHeroCtaLabels = {
  demo: HOME_HERO_DEMO_CTA_LABEL,
} as const satisfies HomeHeroCtaLabels;

export const productCopy = {
  links: {
    cliQuickstart: `${publicProductAnchors.gitRepositoryUrl}#try-it-about-one-minute`,
    /** Relative to site origin — pair with NEXT_PUBLIC_APP_URL in prose docs. */
    openapiCommercial: "/openapi-commercial-v1.yaml",
    commercialPlansApi: "/api/v1/commercial/plans",
  },

  uiTestIds: {
    hero: "home-hero",
    homeWhatCatches: "home-what-catches",
    homeStakes: "home-stakes",
    howItWorks: "home-how-it-works",
    fitAndLimits: "home-fit-and-limits",
    homeClosing: "home-closing",
    tryIt: "home-try-it",
    commercialSurface: "home-commercial-surface",
    tryTruthReport: "try-truth-report",
    tryWorkflowJson: "try-workflow-json",
  },

  hero: {
    title: discoveryAcquisition.heroTitle,
    subtitle: discoveryAcquisition.heroSubtitle,
  },

  /**
   * Homepage hero only: one line under `homepageDecisionFraming`. Must not equal
   * `discoveryAcquisition.heroSubtitle` (that string is brief-only after IA split).
   */
  homeHeroShortTagline:
    "See the product brief for depth and the full terminal contrast. Try the demo below, or Get started on your database.",

  /** Discovery SSOT: outcome framing before mechanism (`hero.subtitle`). */
  homepageHeroNarrative: {
    why: discoveryAcquisition.homepageHero.why,
    what: discoveryAcquisition.homepageHero.what,
    when: discoveryAcquisition.homepageHero.when,
  },

  /** Discovery SSOT: single above-the-fold paragraph on `/` (“when to use / is this for me”). */
  homepageDecisionFraming: discoveryAcquisition.homepageDecisionFraming,

  /** Acquisition page closing section title (UI-only). */
  acquisitionDeepContextSectionTitle: "How this fits the problem",

  /** Learn hub (`/guides`) first line under H1 (UI-only). */
  learnHubPrimaryLede: "Short reads for runs that looked fine until you checked the database.",

  /** Guides hub second lede (UI-only). */
  guidesHubSupportingSentence:
    "Each guide ties a symptom to read-only SQL you can use as a gate, then sends you to Get started on your own data.",

  /** Indexable guide shell embed (UI-only). */
  indexedGuideEmbedTitle:
    "Example: activity that looked successful in logs or traces, missing row (ROW_ABSENT)",
  indexedGuideEmbedMuted:
    "The block below uses the bundled `wf_missing` demo so this page stays aligned with the engine.",

  /** Learn hub (`/guides`) metadata.description (UI-only); includes bundled proof list. */
  learnHubIndexDescription:
    "Learn: short guides plus bundled wf_complete and wf_missing examples for read-only SQL discovery—not private /r/ share links.",

  /** Shared report view one-liner (UI-only). */
  publicShareReportIntro:
    "Private verification snapshot for sharing in tickets or Slack. This URL is not indexed for search; see Security & Trust for how the site handles data.",

  /** Commercial terms above pricing grid — server-rendered from this list. */
  pricingCommercialTermsBullets: [
    {
      lead: "Paid verification",
      body: "Licensed verification with the published npm CLI requires an active Individual, Team, Business, or Enterprise subscription (trial counts); monthly quota applies after subscribe.",
    },
    {
      lead: "Enforcement and CI",
      body: "CI locks, the enforce command, and quick verify with lock flags use the same subscription requirement.",
    },
    {
      lead: "Contracts",
      body: "Limits and semantics: OpenAPI at /openapi-commercial-v1.yaml, plans JSON at /api/v1/commercial/plans, and entitlement docs on GitHub main.",
    },
  ] as const,

  /** Server intro on `/account` (AccountServerAboveFold); links are composed in TSX. */
  accountPage: {
    line1: "Recent verification runs, your plan and usage, and API keys—together in one place.",
    pricingLinkLabel: "Pricing",
    integrateLinkLabel: "Get started",
  } as const,

  howItWorks: {
    sectionTitle: "How it works",
    acquisitionDepthLinkLabel: "Product brief: traces vs database",
    exampleWfMissingLabel: "Bundled ROW_ABSENT example",
  },

  homeWhatCatches: {
    sectionTitle: "What this catches",
    bullets: [
      "Missing rows (ROW_ABSENT) from read-only SQL at verification time.",
      "Wrong values versus what structured tool activity claimed.",
      "Workflows that look finished in traces but are incomplete in the database.",
    ],
  },

  homeClosing: {
    sectionTitle: "Next: verify on your data",
    subtitle: "Read-only SQL at verification time—not trace color alone—before you ship or gate CI.",
    integratorLinksCaption: "Docs & integration",
  },

  homeStakes: {
    sectionTitle: "When the database tells a different story",
    stakesTagline: "This is how bugs pass CI, billing breaks, and compliance fails.",
    tensionBullets: [
      "Trace says success.",
      "Database is wrong.",
      "You ship anyway.",
    ],
    stakesBullets: ["Money lost.", "Compliance broken.", "Bugs reach production."],
  },

  fitAndLimits: {
    sectionTitle: "Fit and limits",
  },

  homepageAcquisitionCta: {
    href: discoveryAcquisition.slug,
    label: discoveryAcquisition.homepageAcquisitionCtaLabel,
    testId: "homepage-acquisition-cta" as const,
  },

  /** Security & Trust page — factual only; link out to normative docs for guarantees. */
  securityTrust: {
    title: "Security & Trust",
    intro:
      "This page summarizes how the product and website handle data at a high level. Verification semantics, limits, and commercial rules are in the linked documentation.",
    sections: [
      {
        heading: "Verification and read-only SQL",
        paragraphs: [
          "The engine compares declared tool activity to read-only `SELECT` results at verification time. It does not prove that a specific call caused a row; see the verification product SSOT for the trust boundary and vocabulary.",
        ],
      },
      {
        heading: "What runs in your environment",
        paragraphs: [
          "The open-source CLI and engine run in your infrastructure against databases you configure. The homepage demo runs bundled fixtures on the server for evaluation only.",
        ],
      },
      {
        heading: "Commercial surface",
        paragraphs: [
          "Licensed npm verification, quota, API keys, and billing are described in the commercial SSOT. Do not infer SLAs or certifications that are not explicitly published here.",
        ],
      },
      {
        heading: "Website, auth, and privacy",
        paragraphs: [
          "Account sign-in uses email magic links. See the Privacy Policy and Terms for data handling on this site.",
        ],
      },
    ],
    docLinks: {
      verificationProductSsot: `${publicProductAnchors.gitRepositoryUrl}/blob/main/docs/verification-product-ssot.md`,
      commercialSsot: `${publicProductAnchors.gitRepositoryUrl}/blob/main/docs/commercial-ssot.md`,
    },
  },

  /** Primary outbound CTA on /guides/verify-langgraph-workflows (LangGraph reference README). */
  langgraphGuidePrimaryCtaLabel: "Open the LangGraph reference README (emit, then verify)",

  scenario: {
    title: "Concrete scenario",
    body: "A support tool reports “ticket closed” and the trace step is green. In the CRM database, the ticket row should be `status = resolved`. Verification compares that expectation to a real `SELECT`—not to the narrative.",
    beforeLabel: "Before",
    before: "You only see trace or tool success; you assume the row was written correctly.",
    afterLabel: "After",
    after: "You get a verdict from observed SQL: aligned with expectations, missing row, or wrong values—still at verification time, not proof of who wrote what.",
  },

  mechanism: {
    title: "Three steps",
    intro: "Capture activity once, declare what the database should show, then verify with read-only SQL.",
    items: ["Capture tool activity", "Define expected DB state", "Verify with read-only SQL"],
    notObservability:
      "This is not generic observability or log search. It compares expected database state to read-only query results at verification time.",
  },

  forYou: [
    "You emit structured tool activity (e.g. NDJSON) your pipeline can produce.",
    "You have SQL-accessible ground truth (SQLite, Postgres, or a mirror).",
    "You care when the run looked fine but rows are wrong or missing.",
  ],

  notForYou: [
    "You only have unstructured logs and no SQL ground truth.",
    "You need causal proof that a particular call wrote a row.",
    "You want a generic APM or log analytics replacement.",
  ],

  guarantees: {
    title: "What is guaranteed (and what is not)",
    guaranteed: [
      "Verdicts are based on read-only SQL against your DB at verification time, under your registry rules.",
      "Same inputs and DB snapshot yield the same deterministic result shape (schema-versioned JSON).",
    ],
    notGuaranteed: [
      "Not proof that a tool executed, committed, or caused a row—only that state did or did not match expectations when checked.",
    ],
  },

  tryIt: {
    title: "Try it (no account)",
    intro: "Pick a bundled scenario. The server runs the same verification engine as the open-source CLI against demo fixtures.",
    introHeroEmbed: "Pick a scenario and run—the same verification engine as the open-source CLI, on bundled fixtures.",
    /** Shown above the run control so failures feel intentional, not random. */
    preButtonFraming:
      "Tip: choose the missing-row scenario (wf_missing)—verification fails with ROW_ABSENT when the log implies a write read-only SQL does not find.",
    runButton: HOME_TRY_IT_RUN_BUTTON_LABEL,
    running: "Running…",
    scenarioLabel: "Scenario",
    /** Live region (polite) after a successful demo verification run. */
    a11ySuccessAnnouncement: "Verification finished. Human report and JSON are shown below.",
  },

  /** Account client: activation copy and a11y announcements (keep in sync with AccountClient UI). */
  account: {
    monthlyQuotaHeading: "Verification quota (this billing month)",
    monthlyQuotaYearMonth: (ym: string) => `Billing month: ${ym} (UTC).`,
    monthlyQuotaKeyLine: (used: number, limitLabel: string) =>
      `${used} used · limit: ${limitLabel}`,
    /** Starter plan: `includedMonthly` is 0; show reserve count without implying a paid allowance. */
    monthlyQuotaStarterKeyLine: (used: number) =>
      `${used} reservation event(s) this UTC month on this key · Starter has no included paid verification quota—subscribe from Pricing for licensed npm and monthly allowance.`,
    monthlyQuotaUnlimited: "Unlimited",
    monthlyQuotaDistinctDays: (n: number) => `Verification days this month: ${n}.`,
    /** Shown as `title` on the verification-days line (UTC / quota nuance). */
    monthlyQuotaDistinctDaysTitle:
      "Each count is a separate UTC calendar day this billing month when you ran paid verification against your allowance.",
    quotaUrgencyCopy: {
      ok: "Usage is comfortably below your plan limit.",
      notice: "You have used at least 75% of your included verifications for this month.",
      warning: "You have used at least 90% of your included verifications for this month.",
      at_cap: "You have reached your included verifications for this month. Upgrade or wait for the next billing month.",
    } as const,
    /** Starter: prior paid usage on key after downgrade—do not imply an active paid allowance. */
    quotaUrgencyStarterPriorUsage:
      "This key may show usage from a prior paid plan. Starter has no included paid verification quota—subscribe from Pricing to run licensed npm verification again.",
    /** Starter: activity signal without prior key usage (edge); still no paid allowance. */
    quotaUrgencyStarterNoIncludedQuota:
      "Starter does not include paid licensed verification quota. Subscribe from Pricing when you need API-keyed runs and a monthly allowance.",
    /** Shown instead of `quotaUrgencyCopy.ok` when there is no usage yet this month. */
    quotaUrgencyZeroUsage: "No verification usage recorded for this billing month yet.",
    a11yApiKeyReady: "API key generated. Copy it from the page and store it safely.",
    apiKeyRevealUrgentTitle: "Copy this now — you will not see the full key again after you leave this page.",
    apiKeyCopyButton: "Copy key",
    apiKeyCopyButtonCopied: "Copied",
    apiKeyCopyFallback: "Copy could not use the clipboard. Select the key above and copy manually (Ctrl+C / ⌘C).",
    checkoutActivationPending:
      "Finishing subscription setup… This usually takes a few seconds. You can refresh the page if it does not update.",
    checkoutActivationReady: "Your subscription is active. You can run paid verification with your API key.",
    checkoutActivationTimeout:
      "Still processing—refresh in a minute or contact the operator if this persists.",
    verificationHeadlineEmpty: "No verification activity yet",
    verificationHeadlineHasRows: "Recent verification activity",
    verificationHeadlineLoadFailed: "Activity did not load",
    verificationMetricLine: (n: number) => `This billing month (UTC): ${n} outcome${n === 1 ? "" : "s"} on record.`,
    verificationMonthNoRowsDetail:
      "We see activity for this billing month, but detailed rows are not available here yet—try refreshing in a moment.",
    activityEmpty:
      "Nothing recorded for this billing month yet. Create a key below if you need one—the Integrate button is your next step.",
    activityLoadError:
      "We could not load verification activity right now. Refresh the page in a moment; if it keeps happening, contact support.",
    trustFootnoteLines: [
      "Billing and subscription details are managed through Stripe; use Manage billing when it appears above.",
      "How keys and data are handled is summarized on the Security & Trust page—this page does not add new guarantees beyond that page.",
    ] as const,
    starterUpgradeBody:
      "Starter is for trying the product. Paid plans unlock real verification runs, predictable monthly usage, and checks you can rely on in CI and production—not just demos.",
    monthlyQuotaNoKeyLine:
      "No active API key yet. Create one below, add it to your environment, then run a verification from Integrate.",
    apiKeyFlowHeading: "Turn your key into a run",
    apiKeyFlowSteps: [
      "Generate an API key below (one-time reveal—copy it immediately).",
      "Set AGENTSKEPTIC_API_KEY in your environment (WORKFLOW_VERIFIER_API_KEY still works).",
      "Open Integrate and run npx agentskeptic verify … from your repo (full commands are on that page).",
    ] as const,
    primaryVerificationCtaFirstRun: "Run your first verification",
    /** When the user has no key yet; verification CTA stays visible but sets expectations. */
    primaryVerificationCtaFirstRunNeedsKey: "Run your first verification (create a key below first)",
    primaryVerificationCtaAgain: "Run another verification",
  },

  signInA11y: {
    sendEmailError: "Could not send sign-in email.",
    /** Shown when Resend rejects recipients while the sender is still `onboarding@resend.dev` (testing). */
    sendEmailResendTestingRecipients:
      "This site’s email is still in the provider’s testing mode, which only delivers magic links to the mailbox tied to that provider account. Ask the operator to verify a sending domain (and set EMAIL_FROM), or try a different email you already use with this site.",
    /** Shown when `from` uses a domain that is not verified in Resend. */
    sendEmailResendFromDomainUnverified:
      "The sign-in email could not be sent because the sender domain is not verified with the mail provider. The operator should verify the domain in Resend and set EMAIL_FROM to an address on that domain.",
    /** Too many magic-link send attempts for this email or IP in the current hour. */
    sendEmailRateLimited:
      "Too many sign-in emails were requested. Wait up to an hour and try again, or contact support if this keeps happening.",
    magicLinkSent: "Check your email for the sign-in link.",
  },

  commercialSurface: {
    title: "What paid plans unlock",
    lead:
      "Open-source includes local verify and `--output-lock` without a site key. Paid adds licensed npm, API keys, reserve, quota, and CI compare/enforce—Stripe on Pricing. See docs/commercial-ssot.md (free vs paid boundary).",
  },

  /** Homepage section CTAs that only scroll to `#try-it` (distinct from hero demo CTA). */
  homeScrollToTryCtaLabel: HOME_SCROLL_TO_TRY_CTA_LABEL,

  /** Retained for SSOT strings; `/pricing` renders `pricingHero` instead. */
  pricingRecap: pricingHero.subtitle,

  /** Retained for SSOT strings; `/pricing` uses `pricingHero.subtitle` in plan-choice testid slot. */
  pricingPlanChoiceGuide: pricingHero.subtitle,

  pricingHero,
  pricingHeroExample,
  pricingRiskReassurance,
  pricingCardStarterPaidQuotaCaption,
  pricingFeatureComparison,
  pricingRecommendedPill,
  pricingTeamFootnote,
  pricingPlanCtas,

  ossClaimPage: {
    title: "Claim this run",
    introUnauthenticated:
      "Sign in with your email to connect this verification run to your account when you opened the claim link from the same browser right after running the CLI.",
    signInCta: "Continue with email",
    redeeming: "Linking this run to your account…",
    sameBrowserRecovery:
      "This claim link must be completed in the same browser profile where you opened it after your CLI run (for example, do not open the magic link on another device). Clear the address bar hash, run the CLI again, open the new claim link here, then request the magic link without leaving this browser—or paste the link in the same browser where you will complete sign-in.",
    claimFailed: "This claim link could not be completed. Request a new link by running the CLI again.",
    rateLimitedRedeem: "Too many claim attempts for this account. Wait up to an hour and try again.",
    alreadyClaimed: "This run was already linked to a different account.",
    redeemedLead: "This run is linked to your account.",
    accountCta: "Go to account",
    runSummary: (r: { run_id: string; terminal_status: string }) =>
      `Run ${r.run_id.slice(0, 8)}… — outcome: ${r.terminal_status}`,
  },

  signInPurpose: {
    title: "Sign in",
    intro:
      "Use your email for a magic link. Signing in lets you subscribe to paid plans, manage your account, and generate API keys—not required for the homepage demo.",
    benefits: [
      "Subscribe to Individual, Team, or Business (Stripe Checkout; trial available on eligible plans)—required before licensed npm verify.",
      "Create and view API keys on the account page after sign-in.",
    ],
  },

  homeHeroCtaLabels,
  pricingTrustBandBeforeGrid,
  securityQuickFacts,
  learnBundledProofLedes,
  learnBundledProofIntegrateLede,

  /** One-line, human captions for `/guides` list items (nav labels stay discovery-stable). */
  learnGuideHubCaptions: {
    "/guides/verify-langgraph-workflows": "After a graph run, confirm the rows your tools claimed.",
    "/guides/trace-green-postgres-row-missing": "Agent trace looks fine; Postgres row is missing or wrong.",
    "/guides/tool-loop-success-crm-state-wrong": "Tool loop succeeded; CRM or SQLite state disagrees.",
    "/guides/ci-green-logs-row-absent": "CI passed on logs; the database write never showed up.",
    "/guides/pre-production-read-only-sql-gate": "A read-only gate before prod—not another log pipeline.",
    "/guides/ai-agent-wrong-crm-data": "Agent touched CRM; verify values before you trust the row.",
    "/guides/automation-success-database-mismatch": "Automation says done; persisted rows say otherwise.",
    "/guides/debug-postgres-after-langgraph": "Post-LangGraph debugging with row-level verification.",
    "/guides/stripe-webhook-database-alignment": "Webhook returned OK; ledger rows still need to match.",
    "/guides/ci-green-missing-database-side-effect": "Green CI while the side-effect row is still missing.",
  } as const satisfies Readonly<Record<string, string>>,

  /**
   * Hub-only link titles (`/guides` list). Discovery `navLabel` stays for routes, llms, and shells;
   * use this map to show calmer phrasing where the indexed title still reads search-shaped.
   */
  learnGuideHubLinkTitles: {
    "/guides/ai-agent-wrong-crm-data": "Wrong CRM data after an AI agent run",
    "/guides/automation-success-database-mismatch": "Automation succeeded; the database disagreed",
    "/guides/ci-green-missing-database-side-effect": "Green CI, missing database side effect",
    "/guides/ci-green-logs-row-absent": "CI passed on logs; the row never landed",
    "/guides/tool-loop-success-crm-state-wrong": "Tool loop says OK; CRM state does not match",
  } as const satisfies Readonly<Partial<Record<string, string>>>,

  supportPageMetadata,
  supportPage,
};
