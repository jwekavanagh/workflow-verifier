import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { companyPageMetadata } from "@/content/productCopy";

export const siteMetadata = {
  title: "AgentSkeptic — check database state against what your workflow claimed",
  description: discoveryAcquisition.pageMetadata.description,
  integrate: {
    title: "Verify workflow claims against the database",
    description:
      "Install Node, Git, and npm once, then paste one command block to clone this repo, build, and run a real read-only SQL check on the built-in demo workflow.",
  },
  security: {
    title: "Security & Trust — AgentSkeptic",
    description:
      "High-level data handling, verification boundary, and links to authoritative product and commercial documentation.",
  },
  company: {
    title: companyPageMetadata.title,
    description: companyPageMetadata.description,
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
