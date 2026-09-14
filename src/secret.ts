/**
 * The secret being shared.
 *
 * @module secret
 */
import { MAX_SECRET_LENGTH, MIN_SECRET_LENGTH } from "./constants.js";
import { brand, hasBrand, isBytes } from "./domain.js";
import { SskrError } from "./error.js";

/**
 * A validated secret: 16–32 bytes, even length. Holds its own copy and
 * hands out copies; nothing outside can change it.
 */
export class Secret {
  readonly #bytes: Uint8Array<ArrayBuffer>;

  private constructor(bytes: Uint8Array<ArrayBuffer>) {
    this.#bytes = bytes;
    brand(this, "Secret@1");
  }

  /** Type guard for a `Secret`, including one from another copy of this package. */
  static isSecret(value: unknown): value is Secret {
    return hasBrand(value, "Secret@1");
  }

  /**
   * A validated copy of `bytes`. The copy is taken first, so the checks and
   * the secret see the same bytes (a `Buffer` is accepted; its `slice`
   * would alias).
   * @throws {SskrError} `InvalidParameter` unless `bytes` is a `Uint8Array`
   * (text goes through {@link Secret.fromText}); then `SecretTooShort`,
   * `SecretTooLong`, `SecretLengthNotEven`, in that order.
   */
  static from(bytes: Uint8Array): Secret {
    if (!isBytes(bytes)) throw SskrError.invalidParameter("bytes", bytes, "a Uint8Array");
    const copy = new Uint8Array(bytes);
    if (copy.length < MIN_SECRET_LENGTH) throw SskrError.of("SecretTooShort");
    if (copy.length > MAX_SECRET_LENGTH) throw SskrError.of("SecretTooLong");
    if ((copy.length & 1) !== 0) throw SskrError.of("SecretLengthNotEven");
    return new Secret(copy);
  }

  /**
   * The UTF-8 bytes of `text`, validated as `from` (the reference's
   * `Secret::new(&str)`). A lone surrogate, which `&str` cannot hold, is
   * encoded as U+FFFD.
   * @throws {SskrError} `InvalidParameter` unless `text` is a string; then the `from` codes.
   */
  static fromText(text: string): Secret {
    if (typeof text !== "string") throw SskrError.invalidParameter("text", text, "a string");
    return Secret.from(new TextEncoder().encode(text));
  }

  /** A fresh copy of the bytes (16–32); mutating it does not change the secret. */
  get bytes(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.#bytes);
  }

  /** The length in bytes. */
  get byteLength(): number {
    return this.#bytes.length;
  }

  /** Same bytes; `false` for anything that is not a `Secret` (one from another copy of this package compares by its bytes). */
  equals(other: unknown): boolean {
    if (!Secret.isSecret(other)) return false;
    const a = this.#bytes;
    if (a.length !== other.byteLength) return false;
    const b = other.bytes;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** A new `Secret` with the same bytes. */
  clone(): Secret {
    return new Secret(new Uint8Array(this.#bytes));
  }
}
