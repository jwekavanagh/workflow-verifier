import { discoveryPublicFileResponse } from "@/lib/publicDiscoveryAssetResponse";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return discoveryPublicFileResponse(
    "llms.txt",
    "text/plain; charset=utf-8",
    "llms.txt not found (run npm run sync:public-product-anchors from repo root, then rebuild).",
  );
}
