import { describe, expect, it, vi } from "vitest";
import { FailureExplanationInvariantError } from "./failureExplanation.js";
import { runStandardVerifyWorkflowCliFlow } from "./standardVerifyWorkflowCli.js";
import { verifyWorkflow } from "./pipeline.js";

vi.mock("./pipeline.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline.js")>();
  return { ...actual, verifyWorkflow: vi.fn() };
});

describe("CLI standard verify path + FailureExplanationInvariantError", () => {
  it("exit 3 on INTERNAL_ERROR path, no WorkflowResult JSON on stdout, when verifyWorkflow throws invariant error", async () => {
    vi.mocked(verifyWorkflow).mockRejectedValue(
      new FailureExplanationInvariantError(
        "EXPLANATION_VERIFICATION_POLICY_INVALID",
        "Verification policy is missing or invalid for failure explanation.",
      ),
    );

    const stderrLines: string[] = [];
    const stdoutLines: string[] = [];
    const exitMock = vi.fn((code: number) => {
      throw new Error(`TEST_EXIT_${code}`);
    });

    await expect(
      runStandardVerifyWorkflowCliFlow({
        runVerify: () =>
          verifyWorkflow({
            workflowId: "w",
            eventsPath: "/nope",
            registryPath: "/nope",
            database: { kind: "sqlite", path: "/nope" },
          }),
        io: {
          consoleLog: (line) => {
            stdoutLines.push(line);
          },
          stderrLine: (line) => {
            stderrLines.push(line);
          },
          exit: exitMock,
        },
      }),
    ).rejects.toThrowError(/TEST_EXIT_3/);

    expect(exitMock).toHaveBeenCalledWith(3);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.length).toBeGreaterThan(0);
    expect(stderrLines[0]).toContain('"code"');
  });
});
