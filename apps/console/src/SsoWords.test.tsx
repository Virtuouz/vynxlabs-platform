import { SSO_REFUSAL_REASONS, SSO_REFUSAL_WORDS } from "@volvel/manifest";
import { expect, test } from "vitest";
import { SignIn } from "./screens/SignIn.tsx";

test("every reason single sign-on can refuse for has words, and the sign-in screen reads them from the shared list", async () => {
  expect(typeof SignIn).toBe("function");
  for (const reason of SSO_REFUSAL_REASONS) expect(SSO_REFUSAL_WORDS[reason], reason).toBeTruthy();
  const source = (await import("node:fs")).readFileSync(
    new URL("./screens/SignIn.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("SSO_REFUSAL_WORDS");
});
