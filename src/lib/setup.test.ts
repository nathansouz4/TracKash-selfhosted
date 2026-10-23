import { describe, expect, it } from "vitest";
import { normalizeItemId, resumeStep, SETUP_STEPS, stepReachable } from "./setup";

describe("setup steps", () => {
  const none = { credentials: false, connections: 0 };
  const withCredentials = { credentials: true, connections: 0 };
  const ready = { credentials: true, connections: 2 };

  it("opens the connections only after the credentials, and the rest after a connection", () => {
    expect(SETUP_STEPS.filter((s) => stepReachable(s, none))).toEqual([
      "welcome",
      "meu-pluggy",
      "credentials",
    ]);
    expect(stepReachable("connections", withCredentials)).toBe(true);
    expect(stepReachable("sync", withCredentials)).toBe(false);
    expect(SETUP_STEPS.every((s) => stepReachable(s, ready))).toBe(true);
  });

  it("resumes at the first required step still missing", () => {
    expect(resumeStep(none)).toBe("welcome");
    expect(resumeStep(withCredentials)).toBe("connections");
    expect(resumeStep(ready)).toBe("b3");
  });

  it("cleans pasted item ids", () => {
    expect(normalizeItemId("  0000AAAA-0000-0000-0000-000000000000 ")).toBe(
      "0000aaaa-0000-0000-0000-000000000000",
    );
  });
});
