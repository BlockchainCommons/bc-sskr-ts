import { COUNT, NIBBLE, U16, USIZE_MAX, expectWidth, usizeOf } from "../src/domain";
import { SskrError } from "../src/error";

describe("domain", () => {
  it("usizeOf accepts numbers up to 2^64 and bigints up to 2^64 - 1", () => {
    expect(usizeOf(0)).toBe(0n);
    expect(usizeOf(-0)).toBe(0n);
    expect(usizeOf(16)).toBe(16n);
    expect(usizeOf(2 ** 53 - 1)).toBe(2n ** 53n - 1n);
    expect(usizeOf(2 ** 53)).toBe(2n ** 53n);
    expect(usizeOf(2 ** 64)).toBe(USIZE_MAX);
    expect(usizeOf(0n)).toBe(0n);
    expect(usizeOf(2n ** 64n - 1n)).toBe(USIZE_MAX);
  });
  it("usizeOf rejects everything else", () => {
    for (const v of [
      18446744073709555712, // the next double above 2^64
      1.5,
      -1,
      NaN,
      Infinity,
      -Infinity,
      -1n,
      2n ** 64n,
      "2",
      null,
      undefined,
      {},
    ]) {
      expect(usizeOf(v)).toBeUndefined();
    }
  });
  it("renders the received value exactly", () => {
    const message = (v: unknown) => SskrError.invalidParameter("memberCount", v, "a usize").message;
    expect(message(NaN)).toBe("memberCount must be a usize, got NaN");
    expect(message(2 ** 64)).toBe("memberCount must be a usize, got 18446744073709551616");
    expect(message(2n)).toBe("memberCount must be a usize, got 2n");
    expect(message("2")).toBe('memberCount must be a usize, got "2"');
    expect(message([])).toBe("memberCount must be a usize, got Array");
    expect(message(null)).toBe("memberCount must be a usize, got null");
    expect(message(new Uint8Array(2))).toBe("memberCount must be a usize, got Uint8Array");
  });
  it("header widths: u16, nibble and count", () => {
    const fits = (v: unknown, b: typeof U16) => {
      try {
        expectWidth("identifier", v, b);
        return true;
      } catch {
        return false;
      }
    };
    expect([0, 0xffff].every((v) => fits(v, U16))).toBe(true);
    expect([-1, 0x10000, 0x1ffff, 1.5, 1n, "1"].some((v) => fits(v, U16))).toBe(false);
    expect([0, 15].every((v) => fits(v, NIBBLE))).toBe(true);
    expect([-1, 16, 17, 1.5, NaN].some((v) => fits(v, NIBBLE))).toBe(false);
    expect([1, 16].every((v) => fits(v, COUNT))).toBe(true);
    expect([0, 17, 1.5].some((v) => fits(v, COUNT))).toBe(false);
    expect(() => expectWidth("groupIndex", 17, NIBBLE)).toThrow(
      "groupIndex must be an integer in [0, 15], got 17",
    );
  });
});
