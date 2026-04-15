import { siteMetadata } from "@/content/siteMetadata";
import { COMMERCIAL_SITE_CSP_NONCE_HEADER } from "@/lib/httpSecurityHeaders";
import discoveryAcquisition from "@/lib/discoveryAcquisition";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import { Analytics } from "@vercel/analytics/react";
import { DM_Sans } from "next/font/google";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { SkipToMainContent } from "@/components/SkipToMainContent";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

const headingFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AgentSkeptic",
  description: discoveryAcquisition.pageMetadata.description,
  url: publicProductAnchors.productionCanonicalOrigin,
  sameAs: [publicProductAnchors.gitRepositoryUrl, publicProductAnchors.npmPackageUrl],
};

export const metadata: Metadata = {
  metadataBase: new URL(publicProductAnchors.productionCanonicalOrigin),
  title: siteMetadata.title,
  description: siteMetadata.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteMetadata.openGraph.title,
    description: siteMetadata.openGraph.description,
    type: "website",
    url: "/",
    images: [
      {
        url: siteMetadata.openGraphImage.path,
        width: siteMetadata.openGraphImage.width,
        height: siteMetadata.openGraphImage.height,
        alt: siteMetadata.openGraphImage.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteMetadata.openGraph.title,
    description: siteMetadata.openGraph.description,
    images: [siteMetadata.openGraphImage.path],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get(COMMERCIAL_SITE_CSP_NONCE_HEADER) ?? "";
  return (
    <html lang="en" className={headingFont.variable}>
      <body>
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
        <SkipToMainContent />
        <SiteHeader />
        <Providers>
          <div id="site-main" className="site-main" tabIndex={-1}>
            {children}
          </div>
        </Providers>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
