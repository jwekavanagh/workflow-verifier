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

export type HomeHeroCtaLabels = { demo: string };

/** Single label for every primary homepage demo CTA (hero, repeats, Try it button). */
export const HOME_DEMO_PRIMARY_CTA_LABEL = "Run a real verification (~30s)" as const;

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
  title: "Billing and plan changes",
  paragraphs: [
    "Subscribe with Stripe Checkout; manage cards, invoices, and upgrades from Account. Upgrade tiers as usage grows.",
    "Enterprise: use Contact sales on the Enterprise card for procurement, custom limits, or contract terms—do not use unpublished sales inboxes.",
  ],
  links: [
    { label: "Security & Trust", href: "/security" as const },
    { label: "Company and support", href: "/company" as const },
  ],
} as const satisfies PricingTrustBandBeforeGrid;

/** Above-the-fold `/pricing` hero (title, stakes, subhead, one-line tier hint). */
export const pricingHero = {
  title: "Pricing for database truth verification",
  positioning: "Stop shipping workflows that look successful but write incorrect data.",
  subtitle: "Start free. Pay when you need CI enforcement and production-scale verification.",
  /** Replaces a longer bullet list: one scannable line before the example and cards. */
  tierSummaryOneLine:
    "Try locally on Starter, add CI for yourself on Individual, standardize enforcement for the team on Team, and grow usage on Business.",
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
  "Cancel anytime. Local verification stays free as long as you need it.";

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
      feature: "Fail the build when the database does not match",
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
      starter: "100",
      individual: "2,000",
      team: "10,000",
      business: "50,000",
      enterprise: "Custom",
    },
  ],
} as const;

/** Truthful guidance without implying existing customer mix. */
export const pricingRecommendedPill = "For production CI";

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
    "Verification compares structured tool activity to read-only SELECT results at verification time; it does not prove a specific network call caused a row.",
    "Accounts on this site use email magic links; paid plans use Stripe; see Privacy and Terms for site-side data handling.",
    "Authoritative semantics and commercial limits are in the linked repository markdown cited on this page—not marketing paraphrase.",
  ],
} as const satisfies SecurityQuickFacts;

/** Static copy for `/integrate` activation (no embedded docs on this route). */
export const integrateActivation = {
  whyHeading: "Why this matters",
  whyParagraphs: [
    "Traces can look successful while the database is wrong—missing rows, wrong values, or writes that never landed.",
    "AgentSkeptic runs read-only SQL at verification time and compares what actually exists to what your captured tool activity claims, so you get database truth instead of narrative or trace color alone.",
  ],
  icp: "If you build workflows, agents, or systems that write to a database, this is the fastest way to see how verification reads that ground truth.",
  requirementsHeading: "You need",
  requirements: ["Node.js 22.13 or newer", "Git", "npm"],
  runHeading: "Run this",
  runCaption: "Copy the whole block, paste it in a terminal, and wait until it finishes.",
  command:
    "git clone --depth 1 https://github.com/jwekavanagh/agentskeptic.git && cd agentskeptic && npm install && npm run build && npm run first-run-verify",
  successHeading: "What success looks like",
  successIntro:
    "When it works, you will see proof from both the human report and the machine-readable result.",
  successBullets: [
    "Stderr shows the human verification report, including the line: Matched the database.",
    'Stdout shows one JSON object with "status":"complete" and a step marked verified.',
    "The last line printed on stdout is exactly: first-run-verify: ok (sqlite)",
    "If you see a Node experimental SQLite warning on stderr, you can ignore it—it does not mean the check failed.",
  ],
  provedHeading: "What you just proved",
  proved:
    "A bundled example wrote expectations from structured tool activity and confirmed them with read-only SQL against a fresh SQLite database—the same engine you will use with your own NDJSON and database.",
  nextHeading: "Next: your system",
  next:
    "You can now reuse the same CLI with your own NDJSON, registry, and database. Point it at your append-only tool log, your tools.json, and your SQLite or Postgres (read-only at verification time).",
} as const;

export const homeHeroCtaLabels = {
  demo: HOME_DEMO_PRIMARY_CTA_LABEL,
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
      lead: "Paid verification",
      body: "The published npm CLI, API keys, and quota require an active paid plan (trials count). Open-source repo builds verify without a subscription.",
    },
    {
      lead: "Contracts",
      body: "Limits and semantics: OpenAPI at /openapi-commercial-v1.yaml, plans JSON at /api/v1/commercial/plans, and entitlement docs on GitHub main.",
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
    acquisitionDepthLinkLabel: "Traces vs database (full framing)",
    exampleWfMissingLabel: "Bundled ROW_ABSENT example",
  },

  /** Moment-of-realization line directly under hero title stream. */
  homeMomentLine: "If you've ever trusted a green trace and been wrong—this is for you.",

  homeWhatCatches: {
    sectionTitle: "What this catches",
    bullets: [
      "Missing rows (ROW_ABSENT) from read-only SQL at verification time.",
      "Wrong values versus what structured tool activity claimed.",
      "Workflows that look finished in traces but are incomplete in the database.",
    ],
  },

  homeClosing: {
    sectionTitle: "Stop trusting traces alone",
    subtitle: "Verify your database state before you ship.",
    integratorLinksCaption: "Docs & integration",
  },

  homeStakes: {
    sectionTitle: "When traces lie",
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
    introHeroEmbed: "Pick a scenario and run—the same verification engine as the open-source CLI, on bundled fixtures.",
    /** Shown above the run control so failures feel intentional, not random. */
    preButtonFraming:
      "Tip: choose the missing-row scenario (wf_missing)—verification fails with ROW_ABSENT when the log implies a write read-only SQL does not find.",
    runButton: HOME_DEMO_PRIMARY_CTA_LABEL,
    running: "Running…",
    scenarioLabel: "Scenario",
    /** Live region (polite) after a successful demo verification run. */
    a11ySuccessAnnouncement: "Verification finished. Human report and JSON are shown below.",
  },

  /** Account client: activation copy and a11y announcements (keep in sync with AccountClient UI). */
  account: {
    a11yApiKeyReady: "API key generated. Copy it from the page and store it safely.",
    checkoutActivationPending:
      "Finishing subscription setup… This usually takes a few seconds. You can refresh the page if it does not update.",
    checkoutActivationReady: "Your subscription is active. You can use licensed verify with your API key.",
    checkoutActivationTimeout:
      "Still processing—refresh in a minute or contact the operator if this persists.",
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
      "Open-source lets you contract-verify from the repo without an API key; licensed npm usage, quota, and keys follow Pricing and Account. Machine-readable contracts stay on the site.",
  },

  /** Retained for SSOT strings; `/pricing` renders `pricingHero` instead. */
  pricingRecap: pricingHero.subtitle,

  /** Retained for SSOT strings; `/pricing` renders `pricingHero.tierSummaryOneLine` in plan-choice slot. */
  pricingPlanChoiceGuide: pricingHero.tierSummaryOneLine,

  pricingHero,
  pricingHeroExample,
  pricingRiskReassurance,
  pricingFeatureComparison,
  pricingRecommendedPill,
  pricingPlanCtas,

  /** Pill on the Individual pricing card (client). */
  pricingIndividualEntryPill: "Solo CI entry",

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
  examplesHubLedes,
  examplesHubIntegrateLede,
  companyPageMetadata,
  companyPage,
};
