import { auth } from "@/auth";
import Link from "next/link";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          Workflow Verifier
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#try-it">Try</Link>
          <Link href="/integrate">Integrate</Link>
          <Link href="/#example">Example</Link>
          <Link href="/pricing">Pricing</Link>
          {signedIn ? (
            <Link href="/account">Account</Link>
          ) : (
            <Link href="/auth/signin?callbackUrl=%2Faccount">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
