import { VerificationReportView } from "@/components/VerificationReportView";
import { getExampleEmbed } from "@/lib/exampleEmbeds";

type Variant = "wf_complete" | "wf_missing";

const titles: Record<Variant, string> = {
  wf_complete: "Bundled demo: wf_complete (verified)",
  wf_missing: "Bundled demo: wf_missing (ROW_ABSENT)",
};

const blurbs: Record<Variant, string> = {
  wf_complete:
    "The block below uses the committed public-report envelope for wf_complete so this page stays aligned with the engine.",
  wf_missing:
    "The block below reuses the same bundled wf_missing envelope used on indexable guides so ROW_ABSENT stays consistent.",
};

type Props = {
  variant: Variant;
};

export function ExampleVerificationEmbed({ variant }: Props) {
  const embed = getExampleEmbed(variant);
  const humanText =
    embed.kind === "workflow" ? embed.truthReportText : embed.humanReportText;
  return (
    <section className="home-section" aria-labelledby={`example-embed-${variant}`}>
      <h2 id={`example-embed-${variant}`}>{titles[variant]}</h2>
      <p className="muted">{blurbs[variant]}</p>
      <VerificationReportView humanText={humanText} payload={embed} variant="embed" />
    </section>
  );
}
