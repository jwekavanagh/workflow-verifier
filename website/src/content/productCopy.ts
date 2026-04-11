/** Single source for homepage, pricing recap, sign-in framing, and test ids. */

import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";

export const productCopy = {
  links: {
    cliQuickstart: `${publicProductAnchors.gitRepositoryUrl}#try-it-about-one-minute`,
    /** Relative to site origin — pair with NEXT_PUBLIC_APP_URL in prose docs. */
    openapiCommercial: "/openapi-commercial-v1.yaml",
    commercialPlansApi: "/api/v1/commercial/plans",
  },

  uiTestIds: {
    hero: "home-hero",
    scenario: "home-scenario",
    mechanism: "home-mechanism",
    qualification: "home-qualification",
    guarantees: "home-guarantees",
    example: "home-example",
    tryIt: "home-try-it",
    commercialSurface: "home-commercial-surface",
    nextSteps: "home-next-steps",
    tryTruthReport: "try-truth-report",
    tryWorkflowJson: "try-workflow-json",
  },

  hero: {
    title: discoveryAcquisition.heroTitle,
    what: discoveryAcquisition.homepageHero.what,
    why: discoveryAcquisition.homepageHero.why,
    when: discoveryAcquisition.homepageHero.when,
  },

  homepageAcquisitionCta: {
    href: discoveryAcquisition.slug,
    label: discoveryAcquisition.homepageAcquisitionCtaLabel,
    testId: "homepage-acquisition-cta" as const,
  },

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
      "This is not generic observability or log search. It is a deterministic comparison of expected state to live database reads—not proof that a specific API call caused a row.",
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

  exampleSectionTitle: "Example: same engine as the CLI",

  tryIt: {
    title: "Try it (no account)",
    intro: "Pick a bundled scenario. The server runs the same verification engine as the open-source CLI against demo fixtures.",
    runButton: "Run verification",
    running: "Running…",
    scenarioLabel: "Scenario",
  },

  commercialSurface: {
    title: "Commercial surface (what the product charges for)",
    body:
      "The default OSS build from this repository gives you full contract verify without an API key. The published npm package uses license preflight: licensed verify, quick verify, and CI locks require an active Individual, Team, Business, or Enterprise subscription (Stripe trial counts), then consume monthly quota. Higher tiers add headroom. Machine contracts: OpenAPI and plans JSON are linked from docs and the account page.",
  },

  nextSteps: {
    title: "What to do next",
    integrate: "Run on your database (copy-paste first run)",
    cli: "Run the one-minute CLI demo on your machine",
    signIn: "Sign in for account, API keys, and paid plans",
    pricing: "See pricing",
  },

  pricingRecap:
    "You subscribe for licensed npm verification and higher monthly quota; OSS/source remains free for verify. Each tier states who it is for and what it unlocks.",

  pricingSignInCta: "Sign in to subscribe",

  signInPurpose: {
    title: "Sign in",
    intro:
      "Use your email for a magic link. Signing in lets you subscribe to paid plans, manage your account, and generate API keys—not required for the homepage demo.",
    benefits: [
      "Subscribe to Team or Business (Stripe Checkout; trial available)—required before licensed npm verify.",
      "Create and view API keys on the account page after sign-in.",
    ],
  },
};
