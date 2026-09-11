import { COUNT, NIBBLE, U16, USIZE, isIntIn } from "../src/domain";

describe("domain", () => {
  it("usize accepts safe non-negative integers only", () => {
    for (const v of [0, 1, 16, 2 ** 53 - 1]) expect(isIntIn(v, USIZE)).toBe(true);
    for (const v of [-1, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 53]) {
      expect(isIntIn(v, USIZE)).toBe(false);
    }
  });
  it("u16, nibble and count have their wire widths", () => {
    expect([0, 0xffff].every((v) => isIntIn(v, U16))).toBe(true);
    expect([-1, 0x10000, 0x1ffff, 1.5].some((v) => isIntIn(v, U16))).toBe(false);
    expect([0, 15].every((v) => isIntIn(v, NIBBLE))).toBe(true);
    expect([-1, 16, 17, 1.5, NaN].some((v) => isIntIn(v, NIBBLE))).toBe(false);
    expect([1, 16].every((v) => isIntIn(v, COUNT))).toBe(true);
    expect([0, 17, 1.5].some((v) => isIntIn(v, COUNT))).toBe(false);
  });
});
