import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  isoDate,
  isoTimestamp,
  isValidMonth,
  monthRange,
  todayIso,
} from "./dates";
import { formatDateBR, formatSignedPercent, monthLongLabel, monthShortLabel } from "./format";

describe("dates", () => {
  it("takes today's date in São Paulo, not UTC", () => {
    // 01:30 UTC on Oct 14 is still Oct 13 in Brazil.
    expect(todayIso(new Date("2026-10-14T01:30:00Z"))).toBe("2026-10-13");
  });

  it("keeps the calendar day of UTC-midnight timestamps", () => {
    expect(isoDate("2026-10-05T00:00:00.000Z")).toBe("2026-10-05");
    expect(isoDate(null)).toBeNull();
  });

  it("normalizes timestamps to UTC ISO strings", () => {
    expect(isoTimestamp("2026-10-05T00:00:00-03:00")).toBe("2026-10-05T03:00:00.000Z");
    expect(isoTimestamp("2026-10-05T03:00:00Z")).toBe("2026-10-05T03:00:00.000Z");
    expect(isoTimestamp("not a date")).toBe("not a date");
    expect(isoTimestamp(undefined)).toBeNull();
  });

  it("does month and day arithmetic across year boundaries", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthRange("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("validates month params", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-10-01")).toBe(false);
    expect(isValidMonth(undefined)).toBe(false);
  });
});

describe("format", () => {
  it("formats dates and months in pt-BR", () => {
    expect(formatDateBR("2026-10-05T00:00:00.000Z")).toBe("05/10/2026");
    expect(monthShortLabel("2026-10")).toBe("out/26");
    expect(monthLongLabel("2026-03")).toBe("março de 2026");
  });

  it("formats signed percentages with a real minus sign", () => {
    expect(formatSignedPercent(0.123)).toBe("+12,3%");
    expect(formatSignedPercent(-0.05)).toBe("−5,0%");
    expect(formatSignedPercent(null)).toBe("—");
  });
});
