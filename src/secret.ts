/**
 * The secret being shared.
 *
 * @module secret
 */
import { MAX_SECRET_LENGTH, MIN_SECRET_LENGTH } from "./constants.js";
import { SskrError } from "./error.js";

/**
 * A validated secret: 16–32 bytes, even length. Holds its own copy and
 * hands out copies; nothing outside can change it.
 */
export class Secret {
  readonly #bytes: Uint8Array<ArrayBuffer>;

  private constructor(bytes: Uint8Array<ArrayBuffer>) {
    this.#bytes = bytes;
  }

  /**
   * A validated copy of `bytes`.
   * @throws {SskrError} `SecretTooShort`, `SecretTooLong`, `SecretLengthNotEven`, in that order.
   */
  static from(bytes: Uint8Array): Secret {
    if (bytes.length < MIN_SECRET_LENGTH) throw SskrError.of("SecretTooShort");
    if (bytes.length > MAX_SECRET_LENGTH) throw SskrError.of("SecretTooLong");
    if ((bytes.length & 1) !== 0) throw SskrError.of("SecretLengthNotEven");
    return new Secret(new Uint8Array(bytes));
  }

  /** The UTF-8 bytes of `text`, validated as `from`. */
  static fromText(text: string): Secret {
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

  /** Same bytes. */
  equals(other: Secret): boolean {
    const a = this.#bytes;
    const b = other.#bytes;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** A new `Secret` with the same bytes. */
  clone(): Secret {
    return new Secret(new Uint8Array(this.#bytes));
  }
}
