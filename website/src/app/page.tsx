import { demoExampleSnippets } from "@/content/demoExampleSnippets";
import { productCopy } from "@/content/productCopy";
import Link from "next/link";
import { Fragment } from "react";
import { TryItSection } from "./home/TryItSection";
import { HOME_SECTION_ORDER, type HomeSectionId } from "./page.sections";

export default function HomePage() {
  const sectionRenderers: Record<HomeSectionId, React.ReactNode> = {
    hero: (
      <section
        key="hero"
        className="home-section"
        data-testid={productCopy.uiTestIds.hero}
        aria-labelledby="hero-heading"
      >
        <h1 id="hero-heading">{productCopy.hero.title}</h1>
        <p className="lede">
          <strong>What:</strong> {productCopy.hero.what}
        </p>
        <p className="lede">
          <strong>Why:</strong> {productCopy.hero.why}
        </p>
        <p className="lede">
          <strong>When:</strong> {productCopy.hero.when}
        </p>
        <p className="home-cta-row">
          <a className="btn" href="#try-it">
            Run verification
          </a>
          <Link className="link-secondary" href="/integrate">
            Integrate
          </Link>
          <Link className="link-secondary" href="#example">
            View example
          </Link>
          <Link className="link-tertiary" href="/pricing">
            Pricing
          </Link>
        </p>
      </section>
    ),
    scenario: (
      <section
        key="scenario"
        className="home-section"
        data-testid={productCopy.uiTestIds.scenario}
        aria-labelledby="scenario-heading"
      >
        <h2 id="scenario-heading">{productCopy.scenario.title}</h2>
        <p>{productCopy.scenario.body}</p>
        <div className="before-after">
          <div>
            <h3 className="before-after-label">{productCopy.scenario.beforeLabel}</h3>
            <p>{productCopy.scenario.before}</p>
          </div>
          <div>
            <h3 className="before-after-label">{productCopy.scenario.afterLabel}</h3>
            <p>{productCopy.scenario.after}</p>
          </div>
        </div>
      </section>
    ),
    mechanism: (
      <section
        key="mechanism"
        className="home-section"
        data-testid={productCopy.uiTestIds.mechanism}
        aria-labelledby="mechanism-heading"
      >
        <h2 id="mechanism-heading">{productCopy.mechanism.title}</h2>
        <ol className="mechanism-list">
          {productCopy.mechanism.items.map((item) => (
            <li key={item.slice(0, 48)}>{item}</li>
          ))}
        </ol>
        <p className="muted">{productCopy.mechanism.notObservability}</p>
      </section>
    ),
    qualification: (
      <section
        key="qualification"
        className="home-section"
        data-testid={productCopy.uiTestIds.qualification}
        aria-labelledby="qual-heading"
      >
        <h2 id="qual-heading">Who this is for</h2>
        <div className="two-col-lists">
          <div>
            <h3>For you</h3>
            <ul>
              {productCopy.forYou.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Not for you</h3>
            <ul>
              {productCopy.notForYou.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    ),
    guarantees: (
      <section
        key="guarantees"
        className="home-section"
        data-testid={productCopy.uiTestIds.guarantees}
        aria-labelledby="guarantees-heading"
      >
        <h2 id="guarantees-heading">{productCopy.guarantees.title}</h2>
        <h3 className="guarantee-sub">Guaranteed</h3>
        <ul>
          {productCopy.guarantees.guaranteed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3 className="guarantee-sub">Not guaranteed</h3>
        <ul>
          {productCopy.guarantees.notGuaranteed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    ),
    example: (
      <section
        key="example"
        id="example"
        className="home-section"
        data-testid={productCopy.uiTestIds.example}
        aria-labelledby="example-heading"
      >
        <h2 id="example-heading">{productCopy.exampleSectionTitle}</h2>
        <p className="muted">
          Bundled workflows <code>wf_complete</code>, <code>wf_missing</code>, and{" "}
          <code>wf_inconsistent</code> use <code>examples/events.ndjson</code>,{" "}
          <code>examples/tools.json</code>, and <code>examples/demo.db</code>—the same inputs as the
          CLI.
        </p>
        {(["wf_complete", "wf_missing", "wf_inconsistent"] as const).map((id) => (
          <div key={id} className="example-block">
            <h3>
              <code>{id}</code>
            </h3>
            <h4 className="example-sub">Truth report (excerpt)</h4>
            <pre className="code-block code-block-short">{demoExampleSnippets[id].truthReportText}</pre>
            <h4 className="example-sub">workflow-result (JSON)</h4>
            <pre className="code-block code-block-scroll">{demoExampleSnippets[id].workflowResultJson}</pre>
          </div>
        ))}
      </section>
    ),
    tryIt: <TryItSection key="tryIt" />,
    nextSteps: (
      <section
        key="nextSteps"
        className="home-section"
        data-testid={productCopy.uiTestIds.nextSteps}
        aria-labelledby="next-heading"
      >
        <h2 id="next-heading">{productCopy.nextSteps.title}</h2>
        <ul className="next-steps-list">
          <li>
            <Link href="/integrate">{productCopy.nextSteps.integrate}</Link>
          </li>
          <li>
            <a href={productCopy.links.cliQuickstart}>{productCopy.nextSteps.cli}</a>
          </li>
          <li>
            <Link href="/auth/signin?callbackUrl=%2Faccount">{productCopy.nextSteps.signIn}</Link>
          </li>
          <li>
            <Link href="/pricing">{productCopy.nextSteps.pricing}</Link>
          </li>
        </ul>
      </section>
    ),
  };

  return (
    <main>
      {HOME_SECTION_ORDER.map((id) => (
        <Fragment key={id}>{sectionRenderers[id]}</Fragment>
      ))}
    </main>
  );
}
