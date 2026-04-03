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

const validatorCache: Partial<Record<"event" | "tools-registry" | "workflow-result", ValidateFunction>> = {};

export function loadSchemaValidator(name: "event" | "tools-registry" | "workflow-result"): ValidateFunction {
  const cached = validatorCache[name];
  if (cached) return cached;

  const file =
    name === "event"
      ? "event.schema.json"
      : name === "tools-registry"
        ? "tools-registry.schema.json"
        : "workflow-result.schema.json";
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
