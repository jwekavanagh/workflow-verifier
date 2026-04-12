/** Single source for homepage, pricing recap, sign-in framing, and test ids. */

import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";

export type InternalHref = "/security" | "/company" | "/pricing" | "/privacy" | "/terms" | "/integrate";

export type PricingTrustBandBeforeGrid = {
  title: string;
  paragraphs: readonly [string, string];
  links: readonly [{ label: string; href: "/security" }, { label: string; href: "/company" }];
};

export type SecurityQuickFacts = {
  title: string;
  bullets: readonly [string, string, string, string];
};

export type CompanyPage = {
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

export type CompanyPageMetadata = { title: string; description: string };

export type ExamplesHubLedes = { primary: string; secondaryMuted: string };

export type HomeHeroCtaLabels = { pricing: string; verify: string };

export const companyPageMetadata = {
  title: "Company and support — AgentSkeptic",
  description:
    "Who operates AgentSkeptic, how to get support, how to buy Enterprise, and where legal and security documentation live.",
} as const satisfies CompanyPageMetadata;

export const companyPage = {
  h1: "Company and support",
  intro:
    "AgentSkeptic is the commercial product surface for a read-only SQL verification engine shipped as open source from the same repository. This page states how to reach the operator, how to report issues, and where to read legal and security documentation.",
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
} as const satisfies CompanyPage;

export const examplesHubLedes = {
  primary:
    "These pages show real verification envelopes for bundled workflows so you can see verified versus ROW_ABSENT outcomes without running the CLI.",
  secondaryMuted:
    "They are indexable public examples. Private paste links use /r/ and stay noindex by design.",
} as const satisfies ExamplesHubLedes;

/** Third lede on `/examples`: visible text split around the `/integrate` link. */
export const examplesHubIntegrateLede = {
  before: "For first-run on your database, follow ",
  after: " and read-only SQL verification contracts in the repository docs.",
} as const;

export const pricingTrustBandBeforeGrid = {
  title: "Buying confidence",
  paragraphs: [
    "Plans cover licensed npm verification, API keys, and monthly quota on the commercial path. Open-source contract verification from the repository remains available without a subscription—the OSS reminder above stays authoritative for what is free versus licensed.",
    "Checkout and billing run through Stripe (Checkout for subscribe; Customer Portal from Account). For procurement, custom limits, or enterprise terms, use Contact sales on the Enterprise pricing card—do not email a sales inbox from this page unless your deployment operator publishes one.",
  ],
  links: [
    { label: "Security & Trust", href: "/security" as const },
    { label: "Company and support", href: "/company" as const },
  ],
} as const satisfies PricingTrustBandBeforeGrid;

export const securityQuickFacts = {
  title: "Quick facts for buyers",
  bullets: [
    "CLI and verification engine run in your infrastructure against databases you configure; the homepage demo runs bundled fixtures on this server for evaluation only.",
    "Verification compares structured tool activity to read-only SELECT results at verification time; it does not prove a specific network call caused a row.",
    "Accounts on this site use email magic links; paid plans use Stripe; see Privacy and Terms for site-side data handling.",
    "Authoritative semantics and commercial limits are in the linked repository markdown cited on this page—not marketing paraphrase.",
  ],
} as const satisfies SecurityQuickFacts;

export const homeHeroCtaLabels = {
  pricing: "View plans and quota",
  verify: "Run verification",
} as const satisfies HomeHeroCtaLabels;

export const homeTrustStripSectionHeading = "Proof and contracts (no signup)";

export const productCopy = {
  links: {
    cliQuickstart: `${publicProductAnchors.gitRepositoryUrl}#try-it-about-one-minute`,
    /** Relative to site origin — pair with NEXT_PUBLIC_APP_URL in prose docs. */
    openapiCommercial: "/openapi-commercial-v1.yaml",
    commercialPlansApi: "/api/v1/commercial/plans",
  },

  uiTestIds: {
    hero: "home-hero",
    howItWorks: "home-how-it-works",
    fitAndLimits: "home-fit-and-limits",
    tryIt: "home-try-it",
    commercialSurface: "home-commercial-surface",
    tryTruthReport: "try-truth-report",
    tryWorkflowJson: "try-workflow-json",
  },

  hero: {
    title: discoveryAcquisition.heroTitle,
    subtitle: discoveryAcquisition.heroSubtitle,
  },

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

  /** Guides hub second lede (UI-only). */
  guidesHubSupportingSentence:
    "Each guide maps a symptom to read-only SQL verification when logs or traces disagree with your database—then points you to first-run integration on your own Postgres or SQLite.",

  /** Indexable guide shell embed (UI-only). */
  indexedGuideEmbedTitle:
    "Example: activity that looked successful in logs or traces, missing row (ROW_ABSENT)",
  indexedGuideEmbedMuted:
    "The block below uses the bundled `wf_missing` demo so this page stays aligned with the engine.",

  /** Examples index metadata.description (UI-only). */
  examplesIndexDescription:
    "Public examples render bundled workflow verification envelopes (wf_complete and wf_missing) for organic discovery—not private /r/ share links.",

  /** Shared report view one-liner (UI-only). */
  publicShareReportIntro:
    "Private verification snapshot for sharing in tickets or Slack. This URL is not indexed for search; see Security & Trust for how the site handles data.",

  /** Commercial terms above pricing grid — server-rendered from this list. */
  pricingCommercialTermsBullets: [
    {
      lead: "Licensed npm CLI",
      body: "Licensed verification with the published npm CLI requires an active Individual, Team, Business, or Enterprise subscription (trial counts); monthly quota applies after subscribe.",
    },
    {
      lead: "CI and enforce",
      body: "CI locks, the enforce command, and quick verify with lock flags use the same subscription requirement.",
    },
  ] as const,

  /** Ordered steps shown on the account page (server); do not duplicate in AccountClient. */
  accountLicensedVerifySteps: [
    "Keep an active paid subscription (Individual, Team, Business, or Enterprise) and a Stripe price this deployment maps to your plan.",
    "Each licensed run must succeed license reserve—your API key alone does not grant verification until subscription, price mapping, and reserve conditions hold.",
    "Set AGENTSKEPTIC_API_KEY (legacy WORKFLOW_VERIFIER_API_KEY still works), then run the commercial CLI from your repo (see Integrate for the full verify command).",
    "Machine contracts: OpenAPI at /openapi-commercial-v1.yaml and plans JSON at /api/v1/commercial/plans; entitlements in commercial-entitlement-matrix.md and commercial-entitlement-policy.md on GitHub main; open Pricing to subscribe or change plans.",
  ] as const,

  howItWorks: {
    sectionTitle: "How it works",
  },

  fitAndLimits: {
    sectionTitle: "Fit and limits",
  },

  homepageAcquisitionCta: {
    href: discoveryAcquisition.slug,
    label: discoveryAcquisition.homepageAcquisitionCtaLabel,
    testId: "homepage-acquisition-cta" as const,
  },

  /** Shown once above the pricing grid; must stay aligned with commercial-ssot OSS path. */
  pricingOssPathReminder:
    "Contract verification from the open-source repo remains free without a subscription. The tiers below are for licensed npm usage, quota, and API keys on the commercial path.",

  /** Security & Trust page — factual only; link out to normative docs for guarantees. */
  securityTrust: {
    title: "Security & Trust",
    intro:
      "This page summarizes how the product and website handle data at a high level. Authoritative verification semantics and limits are in the linked documentation—not marketing paraphrase.",
    sections: [
      {
        heading: "Verification and read-only SQL",
        paragraphs: [
          "Verification compares structured tool activity to read-only `SELECT` results at verification time. It does not prove that a specific call caused a row. See the verification product SSOT for the trust boundary and vocabulary.",
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

  /** `<details>` summary on /integrate for the full embedded integration guide. */
  integrateFullGuideSummary: "Full integration guide (prose SSOT — open when wiring semantics)",

  /** Shown above partner quickstart on /integrate. */
  integrateIntro:
    "Start with the command quickstart below, then open the full guide when you need semantics, guarantees, and common mistakes.",

  scenario: {
    title: "Concrete scenario",
    body: "A support tool reports “ticket closed” and the trace step is green. In the CRM database, the ticket row should be `status = resolved`. Verification compares that expectation to a real `SELECT`—not to the narrative.",
    beforeLabel: "Before",
    before: "You only see trace or tool success; you assume the row was written correctly.",
    afterLabel: "After",
    after: "You get a verdict from observed SQL: aligned with expectations, missing row, or wrong values—still at verification time, not proof of who wrote what.",
  },

  mechanism: {
    title: "Declared → Expected → Observed",
    items: [
      "Declared — what captured tool activity encodes (`toolId`, parameters).",
      "Expected — what should hold in SQL under your registry rules.",
      "Observed — what read-only queries returned at verification time.",
    ],
    notObservability:
      "This is not generic observability or log search. It compares expected database state to read-only query results at verification time.",
  },

  forYou: [
    "You emit structured tool activity (e.g. NDJSON) your pipeline can produce.",
    "You have SQL-accessible ground truth (SQLite, Postgres, or a mirror).",
    "You care when traces look fine but rows are wrong or missing.",
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
    runButton: "Run verification",
    running: "Running…",
    scenarioLabel: "Scenario",
  },

  commercialSurface: {
    title: "Commercial surface (what the product charges for)",
    lead:
      "Open-source lets you contract-verify from the repo without an API key; licensed npm usage, quota, and keys follow Pricing and Account. Machine-readable contracts stay on the site.",
  },

  pricingRecap:
    "You subscribe for licensed npm verification and higher monthly quota; OSS/source remains free for verify. Each tier states who it is for and what it unlocks.",

  pricingSignInCta: "Sign in to subscribe",

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
  homeTrustStripSectionHeading,
  pricingTrustBandBeforeGrid,
  securityQuickFacts,
  examplesHubLedes,
  examplesHubIntegrateLede,
  companyPageMetadata,
  companyPage,
};
