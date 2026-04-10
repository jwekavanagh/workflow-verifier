/** Single source for homepage, pricing recap, sign-in framing, and test ids. */

export const productCopy = {
  links: {
    cliQuickstart:
      "https://github.com/jwekavanagh/workflow-verifier#try-it-about-one-minute",
  },

  uiTestIds: {
    hero: "home-hero",
    scenario: "home-scenario",
    mechanism: "home-mechanism",
    qualification: "home-qualification",
    guarantees: "home-guarantees",
    example: "home-example",
    tryIt: "home-try-it",
    nextSteps: "home-next-steps",
    tryTruthReport: "try-truth-report",
    tryWorkflowJson: "try-workflow-json",
  },

  hero: {
    title: "Your workflow said it worked. Did the database actually change?",
    what: "Workflow Verifier runs read-only SQL at verification time to check that your database matches what structured tool activity claims—row identity, fields, and relational rules.",
    why: "Traces and agents often report success while rows are missing, stale, or wrong. Silent state drift is a production and compliance risk.",
    when: "Use it after agent runs, automations, or human-in-the-loop flows when you need confidence in persisted SQL state—not in log lines or success flags alone.",
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

  nextSteps: {
    title: "What to do next",
    integrate: "Run on your database (copy-paste first run)",
    cli: "Run the one-minute CLI demo on your machine",
    signIn: "Sign in for account, API keys, and paid plans",
    pricing: "See pricing",
  },

  pricingRecap:
    "You pay when you need higher verification volume and commercial CLI features—not to understand the product. Each tier below states who it is for and what it unlocks.",

  pricingSignInCta: "Sign in to subscribe",

  signInPurpose: {
    title: "Sign in",
    intro:
      "Use your email for a magic link. Signing in lets you subscribe to paid plans, manage your account, and generate API keys—not required for the homepage demo.",
    benefits: [
      "Subscribe to Team or Business (Stripe Checkout).",
      "Create and view API keys on the account page.",
    ],
  },
} as const;
