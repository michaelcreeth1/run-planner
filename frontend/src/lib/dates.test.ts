import { describe, expect, it } from "vitest";
import { addDays, parseDate, startOfWeek, toDateInputValue } from "./dates";

describe("date helpers", () => {
  it("keeps Monday dates on the same week start", () => {
    expect(startOfWeek(parseDate("2026-06-29"))).toBe("2026-06-29");
  });

  it("normalizes Sunday dates to the prior Monday", () => {
    expect(startOfWeek(parseDate("2026-07-05"))).toBe("2026-06-29");
  });

  it("handles month and year crossings", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(toDateInputValue(parseDate("2027-01-01"))).toBe("2027-01-01");
  });
});
