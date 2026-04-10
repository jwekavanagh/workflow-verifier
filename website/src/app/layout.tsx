import { siteMetadata } from "@/content/siteMetadata";
import { publicProductAnchors } from "@/lib/publicProductAnchors";
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Workflow Verifier",
  description: publicProductAnchors.identityOneLiner,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
        <SiteHeader />
        <Providers>
          <div className="site-main">{children}</div>
        </Providers>
        <SiteFooter />
      </body>
    </html>
  );
}
