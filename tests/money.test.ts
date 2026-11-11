import { describe, it, expect } from "vitest";
import { amount, comboPayout, proportionalCost, units } from "../src/lib/money";
describe("fixed precision credits", () => {
  it("preserves exact fractional credit amounts", () => {
    expect(units("0.0001")).toBe(1n);
    expect(amount(units("999999999.9999"))).toBe("999999999.9999");
    expect(units("0.1") + units("0.2")).toBe(units("0.3"));
  });
  it.each(["-1", "1e9", "NaN", "0.00001", "1.2.3", ""])(
    "rejects invalid input %s",
    (input) => expect(() => units(input)).toThrow(),
  );
  it("quotes a fully funded all-win payout without floating point", () => {
    expect(comboPayout(units("10"), [5000, 5000])).toBe(units("40"));
    expect(comboPayout(units("1"), [3333, 6667])).toBe(45002n);
  });
  it("consumes the exact remaining cost basis on the final share", () => {
    expect(proportionalCost(100n, 3n, 1n)).toBe(33n);
    expect(proportionalCost(67n, 2n, 2n)).toBe(67n);
  });
});
