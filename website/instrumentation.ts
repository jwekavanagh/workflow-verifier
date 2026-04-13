import { assertProductionCommercialGuards } from "@/lib/assertProductionCommercialGuards";

export function register(): void {
  assertProductionCommercialGuards();
}
