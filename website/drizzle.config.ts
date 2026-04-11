import { defineConfig } from "drizzle-kit";
import { ensureDatabaseUrlForNodePgDriver } from "./src/db/ensureSslModeRequire";

const defaultLocalUrl = "postgresql://postgres:postgres@127.0.0.1:5432/wfv";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      ensureDatabaseUrlForNodePgDriver(process.env.DATABASE_URL?.trim() ?? "") ||
      defaultLocalUrl,
  },
});
