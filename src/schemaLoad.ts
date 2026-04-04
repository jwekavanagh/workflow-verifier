import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const applyAjvFormats = ajvFormats as unknown as (ajv: InstanceType<typeof Ajv2020>) => InstanceType<typeof Ajv2020>;

export function schemasDir(): string {
  return path.join(__dirname, "..", "schemas");
}

let ajvInstance: InstanceType<typeof Ajv2020> | null = null;

function getAjv(): InstanceType<typeof Ajv2020> {
  if (!ajvInstance) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    applyAjvFormats(ajv);
    ajvInstance = ajv;
  }
  return ajvInstance;
}

export type SchemaValidatorName =
  | "event"
  | "tools-registry"
  | "workflow-engine-result"
  | "workflow-truth-report"
  | "workflow-result"
  | "workflow-result-compare-input"
  | "run-comparison-report"
  | "registry-validation-result";

const validatorCache: Partial<Record<SchemaValidatorName, ValidateFunction>> = {};

function compileSchemaFile(name: SchemaValidatorName, file: string): ValidateFunction {
  const cached = validatorCache[name];
  if (cached) return cached;

  const raw = readFileSync(path.join(schemasDir(), file), "utf8");
  const schema = JSON.parse(raw) as object & { $id?: string };
  const ajv = getAjv();
  try {
    const v = ajv.compile(schema);
    validatorCache[name] = v;
    return v;
  } catch (e) {
    const id = schema.$id;
    if (typeof id === "string" && ajv.getSchema(id) !== undefined) {
      ajv.removeSchema(id);
    }
    throw e;
  }
}

/** Ensures engine + truth schemas are registered before emitted `workflow-result` (cross-`$ref`). */
function ensureWorkflowEmittedDependencies(): void {
  compileSchemaFile("workflow-engine-result", "workflow-engine-result.schema.json");
  compileSchemaFile("workflow-truth-report", "workflow-truth-report.schema.json");
}

/** Ensures all branches of compare-input are registered before compiling compare-input. */
function ensureCompareInputDependencies(): void {
  ensureWorkflowEmittedDependencies();
  compileSchemaFile("workflow-result", "workflow-result.schema.json");
}

export function loadSchemaValidator(name: SchemaValidatorName): ValidateFunction {
  switch (name) {
    case "workflow-engine-result":
      return compileSchemaFile(name, "workflow-engine-result.schema.json");
    case "workflow-truth-report":
      return compileSchemaFile(name, "workflow-truth-report.schema.json");
    case "workflow-result":
      ensureWorkflowEmittedDependencies();
      return compileSchemaFile(name, "workflow-result.schema.json");
    case "workflow-result-compare-input":
      ensureCompareInputDependencies();
      return compileSchemaFile(name, "workflow-result-compare-input.schema.json");
    case "event":
      return compileSchemaFile(name, "event.schema.json");
    case "tools-registry":
      return compileSchemaFile(name, "tools-registry.schema.json");
    case "run-comparison-report":
      return compileSchemaFile(name, "run-comparison-report.schema.json");
    case "registry-validation-result":
      return compileSchemaFile(name, "registry-validation-result.schema.json");
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
