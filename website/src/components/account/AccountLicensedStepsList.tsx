import { productCopy } from "@/content/productCopy";

/** Ordered steps for the account page; imported by `app/account/page.tsx` (server) and RTL contract tests. */
export function AccountLicensedStepsList() {
  return (
    <ol
      data-testid="account-licensed-verify-steps"
      className="muted"
      style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}
    >
      {productCopy.accountLicensedVerifySteps.map((step, i) => (
        <li key={i} style={{ marginBottom: "0.35rem" }}>
          {step}
        </li>
      ))}
    </ol>
  );
}
