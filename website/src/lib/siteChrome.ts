export type SiteChromeLink = { key: string; href: string; label: string; external: boolean };

export type SiteChromeAnchors = {
  gitRepositoryUrl: string;
  npmPackageUrl: string;
  bugsUrl: string;
};

export function openapiHrefFromProcessEnv(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return base.length > 0 ? `${base}/openapi-commercial-v1.yaml` : "/openapi-commercial-v1.yaml";
}

export function buildSiteHeaderPrimaryLinks(args: {
  anchors: SiteChromeAnchors;
  acquisitionHref: string;
  acquisitionLabel: string;
}): readonly SiteChromeLink[] {
  const { anchors, acquisitionHref, acquisitionLabel } = args;
  return [
    { key: "pricing", href: "/pricing", label: "Pricing", external: false },
    { key: "security", href: "/security", label: "Security", external: false },
    { key: "acquisition", href: acquisitionHref, label: acquisitionLabel, external: false },
    { key: "integrate", href: "/integrate", label: "Integrate", external: false },
    { key: "try", href: "/#try-it", label: "Try", external: false },
    { key: "guides", href: "/guides", label: "Guides", external: false },
    { key: "examples", href: "/examples", label: "Examples", external: false },
    {
      key: "cli",
      href: `${anchors.gitRepositoryUrl}#try-it-about-one-minute`,
      label: "CLI",
      external: true,
    },
  ] as const;
}

export function buildSiteFooterProductLinks(args: {
  anchors: SiteChromeAnchors;
  openapiHref: string;
}): readonly SiteChromeLink[] {
  const { anchors, openapiHref } = args;
  return [
    { key: "github", href: anchors.gitRepositoryUrl, label: "GitHub", external: true },
    { key: "npm", href: anchors.npmPackageUrl, label: "npm", external: true },
    { key: "openapi", href: openapiHref, label: "OpenAPI", external: false },
    { key: "issues", href: anchors.bugsUrl, label: "GitHub issues", external: true },
    { key: "company", href: "/company", label: "Company", external: false },
  ] as const;
}

export function buildSiteFooterLegalLinks(): readonly SiteChromeLink[] {
  return [
    { key: "security", href: "/security", label: "Security & Trust", external: false },
    { key: "privacy", href: "/privacy", label: "Privacy", external: false },
    { key: "terms", href: "/terms", label: "Terms", external: false },
  ] as const;
}

export function buildHomeTrustStripLinks(args: {
  anchors: SiteChromeAnchors;
  acquisitionHref: string;
  openapiHref: string;
}): readonly SiteChromeLink[] {
  const { anchors, acquisitionHref, openapiHref } = args;
  return [
    { key: "openapi", href: openapiHref, label: "OpenAPI (commercial v1)", external: false },
    { key: "npm", href: anchors.npmPackageUrl, label: "npm package", external: true },
    { key: "github", href: anchors.gitRepositoryUrl, label: "Source repository", external: true },
    { key: "acquisition", href: acquisitionHref, label: "Product brief (canonical)", external: false },
    { key: "integrate", href: "/integrate", label: "First-run integration", external: false },
  ] as const;
}
