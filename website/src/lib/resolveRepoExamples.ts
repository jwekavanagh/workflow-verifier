import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type RepoExamplesPaths = {
  examplesDir: string;
  eventsNdjson: string;
  toolsJson: string;
  demoDb: string;
};

function committedExampleFixturesPresent(examplesDir: string): boolean {
  return (
    existsSync(path.join(examplesDir, "events.ndjson")) &&
    existsSync(path.join(examplesDir, "tools.json")) &&
    existsSync(path.join(examplesDir, "seed.sql"))
  );
}

/**
 * `examples/demo.db` is gitignored (`*.db`); clean checkouts only have `seed.sql`.
 * Same materialization as `scripts/demo.mjs` and `examples/github-actions/workflow-verifier-commercial.yml`.
 */
function ensureExamplesDemoDb(examplesDir: string): void {
  const demoDb = path.join(examplesDir, "demo.db");
  if (existsSync(demoDb)) return;
  const sql = readFileSync(path.join(examplesDir, "seed.sql"), "utf8");
  try {
    const db = new DatabaseSync(demoDb);
    db.exec(sql);
    db.close();
  } catch {
    if (existsSync(demoDb)) return;
    throw new DemoFixturesMissingError(
      `could not create ${demoDb} from seed.sql (cwd=${process.cwd()})`,
    );
  }
}

/**
 * Resolve repo `examples/` whether cwd is `website/` or monorepo root.
 */
export function resolveRepoExamplesPaths(): RepoExamplesPaths {
  const candidates = [
    path.join(process.cwd(), "examples"),
    path.join(process.cwd(), "..", "examples"),
  ];
  for (const examplesDir of candidates) {
    if (!committedExampleFixturesPresent(examplesDir)) continue;
    ensureExamplesDemoDb(examplesDir);
    const demoDb = path.join(examplesDir, "demo.db");
    const eventsNdjson = path.join(examplesDir, "events.ndjson");
    const toolsJson = path.join(examplesDir, "tools.json");
    if (existsSync(demoDb) && existsSync(eventsNdjson) && existsSync(toolsJson)) {
      return {
        examplesDir,
        eventsNdjson,
        toolsJson,
        demoDb,
      };
    }
  }
  throw new DemoFixturesMissingError(
    `examples fixtures not found (tried ${candidates.join(", ")}; cwd=${process.cwd()})`,
  );
}

export class DemoFixturesMissingError extends Error {
  readonly code = "DEMO_FIXTURES_MISSING" as const;
  constructor(message: string) {
    super(message);
    this.name = "DemoFixturesMissingError";
  }
}
