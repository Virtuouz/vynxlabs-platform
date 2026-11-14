import { describe, expect, test } from "vitest";
import { actionWords } from "./audit-words.ts";
import { detailSummary } from "./screens/Operate.tsx";

describe("an audit action in plain words", () => {
  test("names the subject and what happened", () => {
    expect(actionWords("end_user.signed_in")).toBe("End user signed in");
    expect(actionWords("app_domain.enabled")).toBe("Hostname enabled");
    expect(actionWords("access_grant.revoked")).toBe("Operator access revoked");
    expect(actionWords("portal.logo_set")).toBe("Portal logo set");
    expect(actionWords("operator.access")).toBe("Operator opened the tenant");
  });

  test("reads an action it does not know from its words", () => {
    expect(actionWords("purchase_order.placed")).toBe("Purchase order placed");
    expect(actionWords("reindexed")).toBe("Reindexed");
  });
});

describe("what an approval is about", () => {
  test("is the first fields of its detail, in words", () => {
    expect(
      detailSummary({
        clinic: "northside",
        item: "Propofol 20ml",
        total_pence: 37800,
        on_hand: 4,
        more: 1,
      }),
    ).toBe("Clinic: northside · Item: Propofol 20ml · Total pence: 37800 · On hand: 4");
  });

  test("is nothing for no detail, and the value itself for a plain one", () => {
    expect(detailSummary(null)).toBeNull();
    expect(detailSummary({})).toBeNull();
    expect(detailSummary("A-7")).toBe("A-7");
  });
});
