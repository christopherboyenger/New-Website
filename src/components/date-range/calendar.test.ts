import { describe, expect, it } from "vitest";
import { addMonths, addMonthsToDay, dayLabel, isSelectable, monthLabel, monthWeeks, moveFocus, rangeFrom, selectedDaysLabel, windowFor } from "./calendar";

describe("date range calendar math", () => {
  it("lays out a month in Sunday-first weeks with blanks outside the month", () => {
    const weeks = monthWeeks("2026-10");
    expect(weeks[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(weeks.at(-1)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(monthWeeks("2026-02").flat().filter(Boolean)).toHaveLength(28);
    expect(monthWeeks("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });

  it("adds months across years and clamps the day of month", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDay("2026-03-31", -13)).toBe("2025-02-28");
  });

  it("moves focus like the WAI-ARIA date picker grid", () => {
    expect(moveFocus("2026-10-14", "ArrowRight", false)).toBe("2026-10-15");
    expect(moveFocus("2026-10-01", "ArrowLeft", false)).toBe("2026-09-30");
    expect(moveFocus("2026-10-14", "ArrowUp", false)).toBe("2026-10-07");
    expect(moveFocus("2026-10-14", "ArrowDown", false)).toBe("2026-10-21");
    // Oct 14, 2026 is a Wednesday.
    expect(moveFocus("2026-10-14", "Home", false)).toBe("2026-10-11");
    expect(moveFocus("2026-10-14", "End", false)).toBe("2026-10-17");
    expect(moveFocus("2026-10-14", "PageUp", false)).toBe("2026-09-14");
    expect(moveFocus("2026-10-14", "PageDown", true)).toBe("2027-10-14");
    expect(moveFocus("2026-10-14", "Enter", false)).toBeNull();
  });

  it("orders picked days and limits selection to today and 366 days", () => {
    expect(rangeFrom("2026-10-10", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(isSelectable("2026-10-15", "2026-10-14", null)).toBe(false);
    expect(isSelectable("2026-10-14", "2026-10-14", null)).toBe(true);
    expect(isSelectable("2025-10-14", "2026-10-14", "2026-10-14")).toBe(true);
    expect(isSelectable("2025-10-13", "2026-10-14", "2026-10-14")).toBe(false);
  });

  it("labels months, days and the selection length in UTC", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(dayLabel("2026-10-14")).toBe("Wednesday, October 14, 2026");
    expect(selectedDaysLabel({ from: "2026-09-15", to: "2026-10-14" })).toBe("30 days selected");
    expect(selectedDaysLabel({ from: "2026-10-14", to: "2026-10-14" })).toBe("1 day selected");
  });

  it("keeps the focused day inside the visible months, moving as little as possible", () => {
    expect(windowFor("2026-09", 2, "2026-10-20")).toBe("2026-09");
    expect(windowFor("2026-09", 2, "2026-11-02")).toBe("2026-10");
    expect(windowFor("2026-09", 2, "2026-08-31")).toBe("2026-08");
    expect(windowFor("2026-09", 1, "2026-10-01")).toBe("2026-10");
  });
});
