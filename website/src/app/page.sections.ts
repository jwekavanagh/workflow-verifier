/** Ordered homepage section ids — validated in Vitest (conversion funnel order). */
export const HOME_SECTION_ORDER = [
  "hero",
  "homeTrustStrip",
  "howItWorks",
  "fitAndLimits",
  "tryIt",
  "commercialSurface",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_ORDER)[number];
