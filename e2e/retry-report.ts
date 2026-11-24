import { appendFileSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * CI retries a failed test once, so one flaky run does not turn a branch red. A test that
 * passed only on its retry is still a finding: this lists them at the end of the run, as a
 * warning in the log and in the job's summary.
 */
export default class RetryReport implements Reporter {
  private readonly late = new Map<string, number>();

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "passed" && result.retry > 0) {
      this.late.set(test.titlePath().slice(1).join(" > "), result.retry);
    }
  }

  onEnd() {
    if (this.late.size === 0) return;
    const lines = [...this.late].map(([title, retry]) => `${title} (passed on retry ${retry})`);
    console.log(`\nPassed only on retry: ${lines.length}\n  ${lines.join("\n  ")}`);
    for (const line of lines) console.log(`::warning title=Passed only on retry::${line}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      appendFileSync(
        summary,
        `### Passed only on retry\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
      );
    }
  }

  printsToStdio() {
    return false;
  }
}
