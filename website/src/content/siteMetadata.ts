import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { supportPageMetadata } from "@/content/productCopy";

export const siteMetadata = {
  title: "AgentSkeptic — check database state against what your workflow claimed",
  description: discoveryAcquisition.pageMetadata.description,
  integrate: {
    title: "Get started",
    description:
      "Install Node.js 22.13+, Git, and npm. Paste one command block to clone this repo, install dependencies, build, run the bundled demo (npm start), then run first-run verify (npm run first-run-verify) with read-only SQL contract checks. A full run ends with verify-integrator-owned on the integrate spine pack and your prepared SQLite file—that is a mechanical checkpoint on this page, not ProductionComplete on your own emitters. Expect several minutes on a cold clone; install and build can fail for ordinary environment reasons.",
  },
  security: {
    title: "Security & Trust — AgentSkeptic",
    description:
      "High-level data handling, verification boundary, and links to authoritative product and commercial documentation.",
  },
  support: {
    title: supportPageMetadata.title,
    description: supportPageMetadata.description,
  },
  claim: {
    title: "Claim verification run — AgentSkeptic",
    description:
      "Connect an open-source CLI verification run to your account after signing in with email (same browser session as the link from your terminal).",
  },
  openGraph: {
    title: "AgentSkeptic — check database state against what your workflow claimed",
    description: discoveryAcquisition.pageMetadata.description,
  },
  /** Relative to `metadataBase` (canonical production origin). */
  openGraphImage: {
    path: "/og.png",
    width: 1200,
    height: 630,
    alt: "AgentSkeptic — read-only SQL checks against structured tool activity",
  },
} as const;
