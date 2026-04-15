import { describe, expect, it } from "vitest";
import { GET as getLlms } from "@/app/llms.txt/route";
import { GET as getOpenapi } from "@/app/openapi-commercial-v1.yaml/route";

describe("public discovery assets (App Router)", () => {
  it("does not set Access-Control-Allow-Origin: * (ZAP 10098 / permissive CORS)", async () => {
    const [llms, openapi] = await Promise.all([getLlms(), getOpenapi()]);
    for (const res of [llms, openapi]) {
      const acao = res.headers.get("access-control-allow-origin");
      expect(acao).not.toBe("*");
    }
  });
});
