import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { loadAnchors } from "./helpers/distributionGraphHelpers";

const require = createRequire(import.meta.url);
const { assertNextPublicOriginParity, normalize } = require("../../scripts/public-product-anchors.cjs") as {
  assertNextPublicOriginParity: () => void;
  normalize: (s: string) => string;
};

type ParityCase = {
  id: string;
  apply: () => void;
  assert: () => void;
};

describe("public origin parity (assertNextPublicOriginParity)", () => {
  const keys = ["NODE_ENV", "VERCEL_ENV", "NEXT_PUBLIC_APP_URL"] as const;
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of keys) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stashEnv() {
    for (const k of keys) snapshot[k] = process.env[k];
  }

  const cases: ParityCase[] = [
    {
      id: "row: next dev — NODE_ENV development skips parity even when URL mismatches",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "development";
        process.env.VERCEL_ENV = "production";
        process.env.NEXT_PUBLIC_APP_URL = "https://wrong-origin.example";
      },
      assert: () => {
        const canonical = normalize(loadAnchors().productionCanonicalOrigin);
        expect(() => assertNextPublicOriginParity()).not.toThrow();
        expect(normalize(process.env.NEXT_PUBLIC_APP_URL!)).not.toBe(canonical);
      },
    },
    {
      id: "row: Vercel preview — production NODE_ENV with VERCEL_ENV preview skips parity",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        process.env.VERCEL_ENV = "preview";
        process.env.NEXT_PUBLIC_APP_URL = "https://wrong-origin.example";
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).not.toThrow();
      },
    },
    {
      id: "row: Vercel production — enforces parity when URL matches canonical",
      apply: () => {
        stashEnv();
        const anchors = loadAnchors();
        process.env.NODE_ENV = "production";
        process.env.VERCEL_ENV = "production";
        process.env.NEXT_PUBLIC_APP_URL = normalize(anchors.productionCanonicalOrigin);
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).not.toThrow();
      },
    },
    {
      id: "row: Vercel production — throws when URL does not match canonical",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        process.env.VERCEL_ENV = "production";
        process.env.NEXT_PUBLIC_APP_URL = "https://wrong-origin.example";
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).toThrow(/NEXT_PUBLIC_APP_URL must equal productionCanonicalOrigin/);
      },
    },
    {
      id: "row: Vercel production — loopback NEXT_PUBLIC_APP_URL still enforces parity",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        process.env.VERCEL_ENV = "production";
        process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).toThrow(/NEXT_PUBLIC_APP_URL must equal productionCanonicalOrigin/);
      },
    },
    {
      id: "row: local next build — VERCEL_ENV unset enforces parity when URL matches",
      apply: () => {
        stashEnv();
        const anchors = loadAnchors();
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_ENV;
        process.env.NEXT_PUBLIC_APP_URL = normalize(anchors.productionCanonicalOrigin);
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).not.toThrow();
      },
    },
    {
      id: "row: local next build — VERCEL_ENV unset and NEXT_PUBLIC_APP_URL empty — skips parity",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_ENV;
        delete process.env.NEXT_PUBLIC_APP_URL;
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).not.toThrow();
      },
    },
    {
      id: "row: local next build — VERCEL_ENV unset throws when URL mismatches",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_ENV;
        process.env.NEXT_PUBLIC_APP_URL = "https://wrong-origin.example";
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).toThrow(/NEXT_PUBLIC_APP_URL must equal productionCanonicalOrigin/);
      },
    },
    {
      id: "row: local next build — VERCEL_ENV unset skips parity for loopback NEXT_PUBLIC_APP_URL",
      apply: () => {
        stashEnv();
        process.env.NODE_ENV = "production";
        delete process.env.VERCEL_ENV;
        process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
      },
      assert: () => {
        expect(() => assertNextPublicOriginParity()).not.toThrow();
      },
    },
  ];

  for (const row of cases) {
    it(row.id, () => {
      row.apply();
      row.assert();
    });
  }
});
