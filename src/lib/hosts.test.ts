import { describe, expect, it } from "vitest";
import { hostName, isLocalHost } from "./hosts";

describe("hosts", () => {
  it("strips the port", () => {
    expect(hostName("LocalHost:3000")).toBe("localhost");
    expect(hostName("[::1]:4173")).toBe("[::1]");
    expect(hostName("127.0.0.1")).toBe("127.0.0.1");
  });

  it("answers loopback names only", () => {
    expect(isLocalHost("localhost:3000")).toBe(true);
    expect(isLocalHost("127.0.0.1:4173")).toBe(true);
    expect(isLocalHost("[::1]:3000")).toBe(true);
    expect(isLocalHost("app.localhost:3000")).toBe(true);
    // DNS rebinding: a public name resolved to 127.0.0.1.
    expect(isLocalHost("attacker.example:3000")).toBe(false);
    expect(isLocalHost("localhost.attacker.example")).toBe(false);
    expect(isLocalHost("192.168.0.10:3000")).toBe(false);
    expect(isLocalHost("")).toBe(false);
  });
});
