import type { PublicReportEnvelope } from "@/lib/publicVerificationReportService";
import complete from "@/content/embeddedReports/example-wf-complete.v1.json";
import missing from "@/content/embeddedReports/langgraph-guide.v1.json";

export function getExampleEmbed(key: "wf_complete" | "wf_missing"): PublicReportEnvelope {
  switch (key) {
    case "wf_complete":
      return complete as unknown as PublicReportEnvelope;
    case "wf_missing":
      return missing as unknown as PublicReportEnvelope;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
