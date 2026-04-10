export const siteMetadata = {
  title: "Workflow Verifier — check database state against what your workflow claimed",
  description:
    "Read-only SQL verification: compare expected rows from structured tool activity to real database state—so trace success is not mistaken for truth.",
  integrate: {
    title: "Integrate — first run on your database",
    description:
      "Copy-paste steps: NDJSON tool observations, tools.json registry, SQLite or Postgres, and the workflow-verifier CLI.",
  },
  openGraph: {
    title: "Workflow Verifier — check database state against what your workflow claimed",
    description:
      "Read-only SQL verification: compare expected rows from structured tool activity to real database state—so trace success is not mistaken for truth.",
  },
} as const;
