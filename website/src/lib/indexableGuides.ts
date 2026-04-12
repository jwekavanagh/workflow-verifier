import discoveryAcquisition from "./discoveryAcquisition";
import { publicProductAnchors } from "./publicProductAnchors";

export type IndexableGuide = (typeof discoveryAcquisition.indexableGuides)[number];
export type IndexableExample = (typeof discoveryAcquisition.indexableExamples)[number];

export function indexableGuideCanonical(path: string): string {
  const origin = publicProductAnchors.productionCanonicalOrigin.replace(/\/$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function indexableExampleCanonical(path: string): string {
  return indexableGuideCanonical(path);
}

export function getIndexableGuide(path: string): IndexableGuide {
  const g = discoveryAcquisition.indexableGuides.find((x) => x.path === path);
  if (!g) {
    throw new Error(`indexableGuides: unknown path ${path}`);
  }
  return g;
}

export function getIndexableExample(path: string): IndexableExample {
  const e = discoveryAcquisition.indexableExamples.find((x) => x.path === path);
  if (!e) {
    throw new Error(`indexableExamples: unknown path ${path}`);
  }
  return e;
}
