import { auth } from "@/auth";
import { productCopy } from "@/content/productCopy";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          AgentSkeptic
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#try-it">Try</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/examples">Examples</Link>
          <Link href={productCopy.homepageAcquisitionCta.href}>
            {discoveryAcquisition.homepageAcquisitionCtaLabel}
          </Link>
          <Link href="/integrate">Integrate</Link>
          <a href={productCopy.links.cliQuickstart} rel="noreferrer">
            CLI
          </a>
          <Link href="/pricing">Pricing</Link>
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
