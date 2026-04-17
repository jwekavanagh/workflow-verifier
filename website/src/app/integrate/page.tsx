import { FunnelAnonIdExport } from "@/components/FunnelAnonIdExport";
import { FunnelSurfaceBeacon } from "@/components/FunnelSurfaceBeacon";
import { RegistryDraftPanel } from "@/components/RegistryDraftPanel";
import { integrateActivation } from "@/content/productCopy";
import { siteMetadata } from "@/content/siteMetadata";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: siteMetadata.integrate.title,
  description: siteMetadata.integrate.description,
};

export default function IntegratePage() {
  const a = integrateActivation;
  return (
    <main className="integrate-main integrate-prose">
      <FunnelSurfaceBeacon surface="integrate" />
      <h1>{siteMetadata.integrate.title}</h1>
      <p className="muted">{siteMetadata.integrate.description}</p>

      <h2>{a.whyHeading}</h2>
      {a.whyParagraphs.map((p, i) => (
        <p key={i} className="muted">
          {p}
        </p>
      ))}

      <p className="muted">{a.icp}</p>

      <h2>{a.requirementsHeading}</h2>
      <ul className="muted">
        {a.requirements.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>{a.runHeading}</h2>
      <p className="muted">{a.runCaption}</p>
      <FunnelAnonIdExport />
      <div data-testid="integrator-activation-commands">
        <pre>
          <code>{a.command}</code>
        </pre>
      </div>

      <h2>{a.successHeading}</h2>
      <p className="muted">{a.successIntro}</p>
      <ol className="muted">
        {a.successBullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ol>
      <details className="muted integrate-success-details">
        <summary>{a.successDetailsHeading}</summary>
        <ol>
          {a.successDetailsBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
      </details>

      <h2>{a.provedHeading}</h2>
      <p className="muted">{a.proved}</p>

      <h2>{a.nextHeading}</h2>
      <p className="muted">{a.nextLead}</p>
      <ul className="integrate-next-steps">
        {a.nextSteps.map((step) => (
          <li key={step.title} className="integrate-next-step">
            <Link className="integrate-next-destination" href={step.href}>
              {step.linkLabel}
            </Link>
            <div className="integrate-next-step-title">{step.title}</div>
            <p className="muted integrate-next-step-body">{step.body}</p>
          </li>
        ))}
      </ul>

      <RegistryDraftPanel />
    </main>
  );
}
