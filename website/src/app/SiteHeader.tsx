import { auth } from "@/auth";
import { productCopy } from "@/content/productCopy";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { buildSiteHeaderPrimaryLinks } from "@/lib/siteChrome";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  const anchors = {
    gitRepositoryUrl: publicProductAnchors.gitRepositoryUrl,
    npmPackageUrl: publicProductAnchors.npmPackageUrl,
    bugsUrl: publicProductAnchors.bugsUrl,
  };

  const primaryLinks = buildSiteHeaderPrimaryLinks({
    anchors,
    acquisitionHref: productCopy.homepageAcquisitionCta.href,
    acquisitionLabel: discoveryAcquisition.homepageAcquisitionCtaLabel,
  });

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          AgentSkeptic
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {primaryLinks.map((link) => {
            if (link.key === "acquisition") {
              return (
                <Link key={link.key} href={productCopy.homepageAcquisitionCta.href}>
                  {discoveryAcquisition.homepageAcquisitionCtaLabel}
                </Link>
              );
            }
            if (link.key === "cli") {
              return (
                <a key={link.key} href={productCopy.links.cliQuickstart} rel="noreferrer">
                  {link.label}
                </a>
              );
            }
            if (link.external) {
              return (
                <a key={link.key} href={link.href} rel="noreferrer">
                  {link.label}
                </a>
              );
            }
            return (
              <Link key={link.key} href={link.href}>
                {link.label}
              </Link>
            );
          })}
          {signedIn ? (
            <>
              <Link href="/account">Account</Link>
              <SignOutButton variant="nav" />
            </>
          ) : (
            <Link href="/auth/signin?callbackUrl=%2Faccount">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
