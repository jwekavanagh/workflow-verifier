import { readFileSync } from "node:fs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { siteMetadata } from "@/content/siteMetadata";
import { resolveFirstRunIntegrationMd } from "@/lib/resolveRepoDoc";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: siteMetadata.integrate.title,
  description: siteMetadata.integrate.description,
};

export default function IntegratePage() {
  const resolved = resolveFirstRunIntegrationMd();
  if (!resolved) {
    return (
      <main className="integrate-main" role="alert">
        <h1>Integration guide unavailable</h1>
        <p className="muted">
          The file <code>docs/first-run-integration.md</code> was not found on this server. For Vercel or
          monorepo deploys, set <code>NEXT_CONFIG_TRACE_ROOT=1</code> so the repo root (including{" "}
          <code>docs/</code>) is included in the server bundle trace.
        </p>
      </main>
    );
  }
  const md = readFileSync(resolved, "utf8");
  return (
    <main className="integrate-main">
      <article className="integrate-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </article>
    </main>
  );
}
