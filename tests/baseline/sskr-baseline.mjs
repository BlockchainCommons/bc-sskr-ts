//#region ../bc-shamir-ts/tests/baseline/shamir-baseline.mjs
/**
* Error class for Shamir secret sharing operations.
*/
var ShamirError = class ShamirError extends Error {
	type;
	constructor(type, message) {
		super(message ?? ShamirError.defaultMessage(type));
		this.type = type;
		this.name = "ShamirError";
	}
	static defaultMessage(type) {
		switch (type) {
			case "SecretTooLong": return "secret is too long";
			case "TooManyShares": return "too many shares";
			case "InterpolationFailure": return "interpolation failed";
			case "ChecksumFailure": return "checksum failure";
			case "SecretTooShort": return "secret is too short";
			case "SecretNotEvenLen": return "secret is not of even length";
			case "InvalidThreshold": return "invalid threshold";
			case "SharesUnequalLength": return "shares have unequal length";
		}
	}
};
const fromNumH = (n) => n / 2 ** 32 | 0;
const fromNumL = (n) => n >>> 0;
function setU64FromNum(view, byteOffset, n, isLE) {
	const h = fromNumH(n);
	const l = fromNumL(n);
	view.setUint32(byteOffset, isLE ? l : h, isLE);
	view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
/**
* Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
* @param a - value to test
* @returns `true` when the value is a Uint8Array-compatible view.
* @example
* Check whether a value is a Uint8Array-compatible view.
* ```ts
* isBytes(new Uint8Array([1, 2, 3]));
* ```
*/
function isBytes(a) {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
const atitle = (title) => title ? `"${title}" ` : "";
/**
* Asserts something is a non-negative integer.
* @param n - number to validate
* @param title - label included in thrown errors
* @returns The validated number.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a non-negative integer option.
* ```ts
* anumber(32, 'length');
* ```
*/
function anumber(n, title = "") {
	if (typeof n !== "number") throw new TypeError(atitle(title) + "expected number, got " + typeof n);
	if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
	return n;
}
/**
* Asserts something is Uint8Array.
* @param value - value to validate
* @param length - optional exact length constraint
* @param title - label included in thrown errors
* @returns The validated byte array.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate that a value is a byte array.
* ```ts
* abytes(new Uint8Array([1, 2, 3]));
* ```
*/
function abytes(value, length, title = "") {
	if (isBytes(value) && (length === void 0 || value.length === length)) return value;
	if (length !== void 0) anumber(length, "length");
	const bytes = isBytes(value);
	const ofLen = length !== void 0 ? ` of length ${length}` : "";
	const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
	const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
	if (!bytes) throw new TypeError(message);
	throw new RangeError(message);
}
/**
* Asserts something is a wrapped hash constructor.
* @param h - hash constructor to validate
* @throws On wrong argument types or invalid hash wrapper shape. {@link TypeError}
* @throws On invalid hash metadata ranges or values. {@link RangeError}
* @throws If the hash metadata allows empty outputs or block sizes. {@link Error}
* @example
* Validate a callable hash wrapper.
* ```ts
* import { ahash } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* ahash(sha256);
* ```
*/
function ahash(h) {
	if (typeof h !== "function" || typeof h.create !== "function") throw new TypeError("expected hash wrapped by utils.createHasher");
	anumber(h.outputLen);
	anumber(h.blockLen);
	if (h.outputLen < 1 || h.blockLen < 1) throw new Error("hash blockLen / outputLen must be >= 1");
}
const aobject = (value, label) => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
};
const aopts = (value, label) => {
	aobject(value, label);
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) throw new TypeError(`"${label}" expected plain object`);
	if (Object.hasOwn(value, "__proto__")) throw new TypeError(`"${label}.__proto__" is not allowed`);
};
/**
* Asserts a hash instance has not been destroyed or finished.
* @param instance - hash instance to validate
* @param checkFinished - whether to reject finalized instances
* @throws If the hash instance has already been destroyed or finalized. {@link Error}
* @example
* Validate that a hash instance is still usable.
* ```ts
* import { aexists } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aexists(hash);
* ```
*/
function aexists(instance, checkFinished = true) {
	if (instance.destroyed) throw new Error("hash was destroyed");
	if (checkFinished && instance.finished) throw new Error("digest() was already called");
}
/**
* Asserts output is a sufficiently-sized byte array.
* @param out - destination buffer
* @param instance - hash instance providing output length
* Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Validate a caller-provided digest buffer.
* ```ts
* import { aoutput } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const hash = sha256.create();
* aoutput(new Uint8Array(hash.outputLen), hash);
* ```
*/
function aoutput(out, instance) {
	abytes(out, void 0, "output");
	const min = instance.outputLen;
	if (!(out.length >= min)) throw new RangeError("\"output\" expected length >= " + min);
}
/**
* Zeroizes typed arrays in place. Warning: JS provides no guarantees.
* @param arrays - arrays to overwrite with zeros
* @example
* Zeroize sensitive buffers in place.
* ```ts
* clean(new Uint8Array([1, 2, 3]));
* ```
*/
function clean(...arrays) {
	for (let i = 0; i < arrays.length; i++) arrays[i].fill(0);
}
/**
* Creates a DataView for byte-level manipulation.
* @param arr - source typed array
* @returns DataView over the same buffer region.
* @example
* Create a DataView over an existing buffer.
* ```ts
* createView(new Uint8Array(4));
* ```
*/
function createView(arr) {
	return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
* Rotate-right operation for uint32 values.
* @param word - source word
* @param shift - shift amount in bits
* @returns Rotated word.
* @example
* Rotate a 32-bit word to the right.
* ```ts
* rotr(0x12345678, 8);
* ```
*/
function rotr(word, shift) {
	return word << 32 - shift | word >>> shift;
}
/**
* Merges default options and passed options.
* @param defaults - base option object
* @param opts - user overrides
* @param title - label included in thrown override errors
* @returns Fresh merged option object with a null prototype.
* @throws On wrong argument types. {@link TypeError}
* @example
* Merge user overrides onto default options.
* ```ts
* checkOpts({ dkLen: 32 }, { asyncTick: 10 });
* ```
*/
function checkOpts(defaults, opts, title = "opts") {
	aopts(defaults, "defaults");
	if (opts !== void 0) aopts(opts, title);
	return Object.assign(Object.create(null), defaults, opts);
}
/**
* Creates a callable hash function from a stateful class constructor.
* @param hashCons - hash constructor or factory
* @param info - optional metadata such as DER OID
* @returns Frozen callable hash wrapper with `.create()`.
*   Wrapper construction eagerly calls `hashCons(undefined)` once to read
*   `outputLen` / `blockLen`, so constructor side effects happen at module
*   init time.
* @throws On wrong argument types. {@link TypeError}
* @example
* Wrap a stateful hash constructor into a callable helper.
* ```ts
* import { createHasher } from '@noble/hashes/utils.js';
* import { sha256 } from '@noble/hashes/sha2.js';
* const wrapped = createHasher(sha256.create, { oid: sha256.oid });
* wrapped(new Uint8Array([1]));
* ```
*/
function createHasher(hashCons, info = {}) {
	if (typeof hashCons !== "function") throw new TypeError("\"hashCons\" expected function, got type=" + typeof hashCons);
	info = checkOpts({}, info, "info");
	const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
	const tmp = hashCons(void 0);
	hashC.outputLen = tmp.outputLen;
	hashC.blockLen = tmp.blockLen;
	hashC.canXOF = tmp.canXOF;
	hashC.create = (opts) => hashCons(opts);
	Object.assign(hashC, info);
	return Object.freeze(hashC);
}
/**
* Creates OID metadata for NIST hashes with prefix `06 09 60 86 48 01 65 03 04 02`.
* @param suffix - final OID byte for the selected hash.
*   The helper accepts any byte even though only the documented NIST hash
*   suffixes are meaningful downstream.
* @returns Object containing the DER-encoded OID.
* @example
* Build OID metadata for a NIST hash.
* ```ts
* oidNist(0x01);
* ```
*/
const oidNist = (suffix) => ({ oid: Uint8Array.from([
	6,
	9,
	96,
	134,
	72,
	1,
	101,
	3,
	4,
	2,
	suffix
]) });
/**
* Internal Merkle-Damgard hash utils.
* @module
*/
/**
* Shared 32-bit conditional boolean primitive reused by SHA-256, SHA-1, and MD5 `F`.
* Returns bits from `b` when `a` is set, otherwise from `c`.
* The XOR form is equivalent to MD5's `F(X,Y,Z) = XY v not(X)Z` because the masked terms never
* set the same bit.
* @param a - selector word
* @param b - word chosen when selector bit is set
* @param c - word chosen when selector bit is clear
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit choice primitive.
* ```ts
* Chi(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Chi(a, b, c) {
	return a & b ^ ~a & c;
}
/**
* Shared 32-bit majority primitive reused by SHA-256 and SHA-1.
* Returns bits shared by at least two inputs.
* @param a - first input word
* @param b - second input word
* @param c - third input word
* @returns Mixed 32-bit word.
* @example
* Combine three words with the shared 32-bit majority primitive.
* ```ts
* Maj(0xffffffff, 0x12345678, 0x87654321);
* ```
*/
function Maj(a, b, c) {
	return a & b ^ a & c ^ b & c;
}
/**
* Merkle-Damgard hash construction base class.
* Could be used to create MD5, RIPEMD, SHA1, SHA2.
* Accepts only byte-aligned `Uint8Array` input, even when the underlying spec describes bit
* strings with partial-byte tails.
* @param blockLen - internal block size in bytes
* @param outputLen - digest size in bytes
* @param padOffset - trailing length field size in bytes
* @param isLE - whether length and state words are encoded in little-endian
* @example
* Use a concrete subclass to get the shared Merkle-Damgard update/digest flow.
* ```ts
* import { _SHA1 } from '@noble/hashes/legacy.js';
* const hash = new _SHA1();
* hash.update(new Uint8Array([97, 98, 99]));
* hash.digest();
* ```
*/
var HashMD = class {
	blockLen;
	outputLen;
	canXOF = false;
	padOffset;
	isLE;
	buffer;
	view;
	finished = false;
	length = 0;
	pos = 0;
	destroyed = false;
	constructor(blockLen, outputLen, padOffset, isLE) {
		this.blockLen = blockLen;
		this.outputLen = outputLen;
		this.padOffset = padOffset;
		this.isLE = isLE;
		this.buffer = new Uint8Array(blockLen);
		this.view = createView(this.buffer);
	}
	update(data) {
		aexists(this);
		abytes(data);
		const { view, buffer, blockLen } = this;
		const len = data.length;
		let processed = false;
		for (let pos = 0; pos < len;) {
			const take = Math.min(blockLen - this.pos, len - pos);
			if (take === blockLen) {
				const dataView = createView(data);
				for (; blockLen <= len - pos; pos += blockLen) this.process(dataView, pos);
				processed = true;
				continue;
			}
			buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
			this.pos += take;
			pos += take;
			if (this.pos === blockLen) {
				this.process(view, 0);
				this.pos = 0;
				processed = true;
			}
		}
		this.length += data.length;
		if (processed) this.roundClean();
		return this;
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const { buffer, view, blockLen, isLE } = this;
		let { pos } = this;
		buffer[pos++] = 128;
		buffer.fill(0, pos);
		if (this.padOffset > blockLen - pos) {
			this.process(view, 0);
			buffer.fill(0);
		}
		setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
		this.process(view, 0);
		this.roundClean();
		const oview = out === buffer ? view : createView(out);
		const len = this.outputLen;
		const outLen = len / 4;
		const state = this.get();
		if (len % 4 || outLen > state.length) throw new Error("invalid outputLen");
		for (let i = 0; i < outLen; i++) oview.setUint32(4 * i, state[i], isLE);
	}
	digest() {
		const { buffer, outputLen } = this;
		this.digestInto(buffer);
		const res = buffer.slice(0, outputLen);
		this.destroy();
		return res;
	}
	_cloneIntoMeta(to) {
		const { buffer, length, finished, destroyed, pos } = this;
		to.destroyed = destroyed;
		to.finished = finished;
		to.length = length;
		to.pos = pos;
		if (pos) to.buffer.set(buffer);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
};
/**
* Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
* Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
*/
/** Initial SHA256 state from RFC 6234 §6.1: the first 32 bits of the fractional parts of the
* square roots of the first eight prime numbers. Exported as a shared table; callers must treat
* it as read-only because constructors copy words from it by index. */
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
]);
/**
* SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
* SHA256 is the fastest hash implementable in JS, even faster than Blake3.
* Check out {@link https://www.rfc-editor.org/rfc/rfc4634 | RFC 4634} and
* {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | FIPS 180-4}.
* @module
*/
/**
* SHA-224 / SHA-256 round constants from RFC 6234 §5.1: the first 32 bits
* of the cube roots of the first 64 primes (2..311).
*/
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
/** Reusable SHA-224 / SHA-256 message schedule buffer `W_t` from RFC 6234 §6.2 step 1. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
/** Internal SHA-224 / SHA-256 compression engine from RFC 6234 §6.2. */
var SHA2_32B = class extends HashMD {
	A = 0;
	B = 0;
	C = 0;
	D = 0;
	E = 0;
	F = 0;
	G = 0;
	H = 0;
	constructor(outputLen, IV) {
		super(64, outputLen, 8, false);
		this.A = IV[0] | 0;
		this.B = IV[1] | 0;
		this.C = IV[2] | 0;
		this.D = IV[3] | 0;
		this.E = IV[4] | 0;
		this.F = IV[5] | 0;
		this.G = IV[6] | 0;
		this.H = IV[7] | 0;
	}
	get() {
		const { A, B, C, D, E, F, G, H } = this;
		return [
			A,
			B,
			C,
			D,
			E,
			F,
			G,
			H
		];
	}
	set(A, B, C, D, E, F, G, H) {
		this.A = A | 0;
		this.B = B | 0;
		this.C = C | 0;
		this.D = D | 0;
		this.E = E | 0;
		this.F = F | 0;
		this.G = G | 0;
		this.H = H | 0;
	}
	_cloneInto(to) {
		(to ||= new this.constructor()).set(...this.get());
		return this._cloneIntoMeta(to);
	}
	process(view, offset) {
		for (let i = 0; i < 16; i++, offset += 4) SHA256_W[i] = view.getUint32(offset, false);
		for (let i = 16; i < 64; i++) {
			const W15 = SHA256_W[i - 15];
			const W2 = SHA256_W[i - 2];
			const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
			const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
			SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
		}
		let { A, B, C, D, E, F, G, H } = this;
		for (let i = 0; i < 64; i++) {
			const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
			const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
			const T2 = (rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + Maj(A, B, C) | 0;
			H = G;
			G = F;
			F = E;
			E = D + T1 | 0;
			D = C;
			C = B;
			B = A;
			A = T1 + T2 | 0;
		}
		A = A + this.A | 0;
		B = B + this.B | 0;
		C = C + this.C | 0;
		D = D + this.D | 0;
		E = E + this.E | 0;
		F = F + this.F | 0;
		G = G + this.G | 0;
		H = H + this.H | 0;
		this.set(A, B, C, D, E, F, G, H);
	}
	roundClean() {
		clean(SHA256_W);
	}
	destroy() {
		this.destroyed = true;
		this.set(0, 0, 0, 0, 0, 0, 0, 0);
		clean(this.buffer);
	}
};
/** Internal SHA-256 hash class grounded in RFC 6234 §6.2. */
var _SHA256 = class extends SHA2_32B {
	constructor() {
		super(32, SHA256_IV);
	}
};
/**
* SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
*
* - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
* - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
* - Each sha256 hash is executing 2^18 bit operations.
* - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
* @param msg - message bytes to hash
* @param opts - Reserved hash options.
* @returns Digest bytes.
* @example
* Hash a message with SHA2-256.
* ```ts
* sha256(new Uint8Array([97, 98, 99]));
* ```
*/
const sha256 = /* @__PURE__ */ createHasher(() => new _SHA256(), /* @__PURE__ */ oidNist(1));
/**
* HMAC: RFC2104 message authentication code.
* @module
*/
/**
* Internal class for HMAC.
* Accepts any byte key, although RFC 2104 §3 recommends keys at least
* `HashLen` bytes long.
*/
var _HMAC = class {
	oHash;
	iHash;
	blockLen;
	outputLen;
	canXOF = false;
	finished = false;
	destroyed = false;
	constructor(hash, key) {
		ahash(hash);
		abytes(key, void 0, "key");
		this.iHash = hash.create();
		if (typeof this.iHash.update !== "function") throw new Error("expected Hash instance");
		this.blockLen = this.iHash.blockLen;
		this.outputLen = this.iHash.outputLen;
		const blockLen = this.blockLen;
		const pad = new Uint8Array(blockLen);
		pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
		for (let i = 0; i < pad.length; i++) pad[i] ^= 54;
		this.iHash.update(pad);
		this.oHash = hash.create();
		for (let i = 0; i < pad.length; i++) pad[i] ^= 106;
		this.oHash.update(pad);
		clean(pad);
	}
	update(buf) {
		aexists(this);
		this.iHash.update(buf);
		return this;
	}
	digestInto(out) {
		aexists(this);
		aoutput(out, this);
		this.finished = true;
		const buf = out.subarray(0, this.outputLen);
		this.iHash.digestInto(buf);
		this.oHash.update(buf);
		this.oHash.digestInto(buf);
		this.destroy();
	}
	digest() {
		const out = new Uint8Array(this.oHash.outputLen);
		this.digestInto(out);
		return out;
	}
	_cloneInto(to) {
		to ||= Object.create(Object.getPrototypeOf(this), {});
		const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
		to = to;
		to.finished = finished;
		to.destroyed = destroyed;
		to.blockLen = blockLen;
		to.outputLen = outputLen;
		to.canXOF = canXOF;
		to.oHash = oHash._cloneInto(to.oHash);
		to.iHash = iHash._cloneInto(to.iHash);
		return to;
	}
	clone() {
		return this._cloneInto();
	}
	destroy() {
		this.destroyed = true;
		this.oHash.destroy();
		this.iHash.destroy();
	}
};
const hmac = /* @__PURE__ */ (() => {
	const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
	hmac_.create = (hash, key) => new _HMAC(hash, key);
	return hmac_;
})();
const CRC32_TABLE = /* @__PURE__ */ new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let crc = i;
	for (let j = 0; j < 8; j++) crc = (crc & 1) !== 0 ? crc >>> 1 ^ 3988292384 : crc >>> 1;
	CRC32_TABLE[i] = crc >>> 0;
}
/**
* Calculate HMAC-SHA-256
*/
function hmacSha256(key, message) {
	return hmac(sha256, key, message);
}
/**
* Securely zero out a typed array.
*
* Mirrors Rust `bc_crypto::memzero<T>(s: &mut [T])`. The Rust impl uses
* `std::ptr::write_volatile()` to guarantee the writes survive optimization;
* JavaScript has no equivalent primitive, so this is **best-effort** — JIT
* compilers may still elide the loop, though the post-hoc verification
* check forces the engine to keep the writes observable.
*
* For truly sensitive cryptographic operations, consider using the Web
* Crypto API's `crypto.subtle` with non-extractable keys when possible, as
* it provides stronger guarantees than what can be achieved with pure
* JavaScript.
*
* Accepts any of the standard numeric typed arrays — `Uint8Array`,
* `Uint8ClampedArray`, `Uint16Array`, `Uint32Array`, `Int8Array`,
* `Int16Array`, `Int32Array`, `Float32Array`, `Float64Array` — matching
* Rust's generic `&mut [T]`. (`BigInt64Array` / `BigUint64Array` are
* excluded because their elements are `bigint`, not `number`; if that
* support is needed, add a dedicated overload.)
*/
function memzero(data) {
	const len = data.length;
	for (let i = 0; i < len; i++) data[i] = 0;
	if (data.length > 0 && data[0] !== 0) throw new Error("memzero failed");
}
/**
* Securely zero out an array of Uint8Arrays.
*/
function memzeroVecVecU8(arrays) {
	for (const arr of arrays) memzero(arr);
}
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
/**
* Internal contract guard. Mirrors a Rust `assert!(condition, message)`
* panic on the boundary between hazmat helpers — kept as a bare `Error`
* so it cannot be confused with a `ShamirError` from the public API.
*/
function assertContract(condition, message) {
	if (!condition) throw new Error(message);
}
/**
* Convert an array of bytes into a bitsliced representation.
* Takes the first 32 bytes from x and produces 8 u32 values.
*
* @param r - Output array of 8 u32 values (bitsliced representation)
* @param x - Input array of at least 32 bytes
*/
function bitslice(r, x) {
	assertContract(x.length >= 32, "bitslice: input must be at least 32 bytes");
	assertContract(r.length === 8, "bitslice: output must have 8 elements");
	memzero(r);
	for (let arrIdx = 0; arrIdx < 32; arrIdx++) {
		const cur = x[arrIdx];
		for (let bitIdx = 0; bitIdx < 8; bitIdx++) r[bitIdx] |= (cur & 1 << bitIdx) >>> bitIdx << arrIdx;
	}
}
/**
* Convert a bitsliced representation back to bytes.
*
* @param r - Output array of at least 32 bytes
* @param x - Input array of 8 u32 values (bitsliced representation)
*/
function unbitslice(r, x) {
	assertContract(r.length >= 32, "unbitslice: output must be at least 32 bytes");
	assertContract(x.length === 8, "unbitslice: input must have 8 elements");
	memzero(r.subarray(0, 32));
	for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
		const cur = x[bitIdx];
		for (let arrIdx = 0; arrIdx < 32; arrIdx++) r[arrIdx] |= (cur & 1 << arrIdx) >>> arrIdx << bitIdx;
	}
}
/**
* Set all 32 positions in a bitsliced array to the same byte value.
*
* @param r - Output array of 8 u32 values
* @param x - Byte value to set in all positions
*/
function bitsliceSetall(r, x) {
	assertContract(r.length === 8, "bitsliceSetall: output must have 8 elements");
	for (let idx = 0; idx < 8; idx++) {
		const bit = x >>> idx & 1;
		r[idx] = bit === 1 ? 4294967295 : 0;
	}
}
/**
* Add (XOR) r with x and store the result in r.
* In GF(2^8), addition is XOR.
*
* @param r - First operand and result
* @param x - Second operand
*/
function gf256Add(r, x) {
	assertContract(r.length === 8 && x.length === 8, "gf256Add: arrays must have 8 elements");
	for (let i = 0; i < 8; i++) r[i] ^= x[i];
}
/**
* Safely multiply two bitsliced polynomials in GF(2^8) reduced by
* x^8 + x^4 + x^3 + x + 1. r and a may overlap, but overlapping of r
* and b will produce an incorrect result! If you need to square a polynomial
* use gf256Square instead.
*
* @param r - Result array (8 u32 values)
* @param a - First operand (may overlap with r)
* @param b - Second operand (must NOT overlap with r)
*/
function gf256Mul(r, a, b) {
	assertContract(r.length === 8 && a.length === 8 && b.length === 8, "gf256Mul: arrays must have 8 elements");
	const a2 = new Uint32Array(a);
	r[0] = a2[0] & b[0];
	r[1] = a2[1] & b[0];
	r[2] = a2[2] & b[0];
	r[3] = a2[3] & b[0];
	r[4] = a2[4] & b[0];
	r[5] = a2[5] & b[0];
	r[6] = a2[6] & b[0];
	r[7] = a2[7] & b[0];
	a2[0] ^= a2[7];
	a2[2] ^= a2[7];
	a2[3] ^= a2[7];
	r[0] ^= a2[7] & b[1];
	r[1] ^= a2[0] & b[1];
	r[2] ^= a2[1] & b[1];
	r[3] ^= a2[2] & b[1];
	r[4] ^= a2[3] & b[1];
	r[5] ^= a2[4] & b[1];
	r[6] ^= a2[5] & b[1];
	r[7] ^= a2[6] & b[1];
	a2[7] ^= a2[6];
	a2[1] ^= a2[6];
	a2[2] ^= a2[6];
	r[0] ^= a2[6] & b[2];
	r[1] ^= a2[7] & b[2];
	r[2] ^= a2[0] & b[2];
	r[3] ^= a2[1] & b[2];
	r[4] ^= a2[2] & b[2];
	r[5] ^= a2[3] & b[2];
	r[6] ^= a2[4] & b[2];
	r[7] ^= a2[5] & b[2];
	a2[6] ^= a2[5];
	a2[0] ^= a2[5];
	a2[1] ^= a2[5];
	r[0] ^= a2[5] & b[3];
	r[1] ^= a2[6] & b[3];
	r[2] ^= a2[7] & b[3];
	r[3] ^= a2[0] & b[3];
	r[4] ^= a2[1] & b[3];
	r[5] ^= a2[2] & b[3];
	r[6] ^= a2[3] & b[3];
	r[7] ^= a2[4] & b[3];
	a2[5] ^= a2[4];
	a2[7] ^= a2[4];
	a2[0] ^= a2[4];
	r[0] ^= a2[4] & b[4];
	r[1] ^= a2[5] & b[4];
	r[2] ^= a2[6] & b[4];
	r[3] ^= a2[7] & b[4];
	r[4] ^= a2[0] & b[4];
	r[5] ^= a2[1] & b[4];
	r[6] ^= a2[2] & b[4];
	r[7] ^= a2[3] & b[4];
	a2[4] ^= a2[3];
	a2[6] ^= a2[3];
	a2[7] ^= a2[3];
	r[0] ^= a2[3] & b[5];
	r[1] ^= a2[4] & b[5];
	r[2] ^= a2[5] & b[5];
	r[3] ^= a2[6] & b[5];
	r[4] ^= a2[7] & b[5];
	r[5] ^= a2[0] & b[5];
	r[6] ^= a2[1] & b[5];
	r[7] ^= a2[2] & b[5];
	a2[3] ^= a2[2];
	a2[5] ^= a2[2];
	a2[6] ^= a2[2];
	r[0] ^= a2[2] & b[6];
	r[1] ^= a2[3] & b[6];
	r[2] ^= a2[4] & b[6];
	r[3] ^= a2[5] & b[6];
	r[4] ^= a2[6] & b[6];
	r[5] ^= a2[7] & b[6];
	r[6] ^= a2[0] & b[6];
	r[7] ^= a2[1] & b[6];
	a2[2] ^= a2[1];
	a2[4] ^= a2[1];
	a2[5] ^= a2[1];
	r[0] ^= a2[1] & b[7];
	r[1] ^= a2[2] & b[7];
	r[2] ^= a2[3] & b[7];
	r[3] ^= a2[4] & b[7];
	r[4] ^= a2[5] & b[7];
	r[5] ^= a2[6] & b[7];
	r[6] ^= a2[7] & b[7];
	r[7] ^= a2[0] & b[7];
}
/**
* Square x in GF(2^8) and write the result to r.
* r and x may overlap.
*
* @param r - Result array (8 u32 values)
* @param x - Value to square
*/
function gf256Square(r, x) {
	assertContract(r.length === 8 && x.length === 8, "gf256Square: arrays must have 8 elements");
	const r14 = x[7];
	const r12 = x[6];
	let r10 = x[5];
	let r8 = x[4];
	r[6] = x[3];
	r[4] = x[2];
	r[2] = x[1];
	r[0] = x[0];
	r[7] = r14;
	r[6] ^= r14;
	r10 ^= r14;
	r[4] ^= r12;
	r[5] = r12;
	r[7] ^= r12;
	r8 ^= r12;
	r[2] ^= r10;
	r[3] = r10;
	r[5] ^= r10;
	r[6] ^= r10;
	r[1] = r14;
	r[2] ^= r14;
	r[4] ^= r14;
	r[5] ^= r14;
	r[0] ^= r8;
	r[1] ^= r8;
	r[3] ^= r8;
	r[4] ^= r8;
}
/**
* Invert x in GF(2^8) and write the result to r.
*
* @param r - Result array (8 u32 values)
* @param x - Value to invert (will be modified)
*/
function gf256Inv(r, x) {
	assertContract(r.length === 8 && x.length === 8, "gf256Inv: arrays must have 8 elements");
	const y = /* @__PURE__ */ new Uint32Array(8);
	const z = /* @__PURE__ */ new Uint32Array(8);
	gf256Square(y, x);
	gf256Square(y, new Uint32Array(y));
	gf256Square(r, y);
	gf256Mul(z, r, x);
	gf256Square(r, new Uint32Array(r));
	gf256Mul(r, new Uint32Array(r), z);
	gf256Square(r, new Uint32Array(r));
	gf256Square(z, r);
	gf256Square(z, new Uint32Array(z));
	gf256Mul(r, new Uint32Array(r), z);
	gf256Mul(r, new Uint32Array(r), y);
}
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
/**
* Calculate the lagrange basis coefficients for the lagrange polynomial
* defined by the x coordinates xc at the value x.
*
* After the function runs, the values array should hold data satisfying:
*                ---     (x-xc[j])
*   values[i] =  | |   -------------
*              j != i  (xc[i]-xc[j])
*
* @param values - Output array for the lagrange basis values
* @param n - Number of points (length of the xc array, 0 < n <= 32)
* @param xc - Array of x components to use as interpolating points
* @param x - x coordinate to evaluate lagrange polynomials at
*/
function hazmatLagrangeBasis(values, n, xc, x) {
	const xx = /* @__PURE__ */ new Uint8Array(48);
	const xSlice = /* @__PURE__ */ new Uint32Array(8);
	const lxi = [];
	for (let i = 0; i < n; i++) lxi.push(/* @__PURE__ */ new Uint32Array(8));
	const numerator = /* @__PURE__ */ new Uint32Array(8);
	const denominator = /* @__PURE__ */ new Uint32Array(8);
	const temp = /* @__PURE__ */ new Uint32Array(8);
	xx.set(xc.subarray(0, n), 0);
	for (let i = 0; i < n; i++) {
		bitslice(lxi[i], xx.subarray(i));
		xx[i + n] = xx[i];
	}
	bitsliceSetall(xSlice, x);
	bitsliceSetall(numerator, 1);
	bitsliceSetall(denominator, 1);
	for (let i = 1; i < n; i++) {
		temp.set(xSlice);
		gf256Add(temp, lxi[i]);
		gf256Mul(numerator, new Uint32Array(numerator), temp);
		temp.set(lxi[0]);
		gf256Add(temp, lxi[i]);
		gf256Mul(denominator, new Uint32Array(denominator), temp);
	}
	gf256Inv(temp, denominator);
	gf256Mul(numerator, new Uint32Array(numerator), temp);
	unbitslice(xx, numerator);
	values.set(xx.subarray(0, n), 0);
}
/**
* Safely interpolate the polynomial going through
* the points (x0 [y0_0 y0_1 y0_2 ... y0_31]) , (x1 [y1_0 ...]), ...
*
* where
*   xi points to [x0 x1 ... xn-1 ]
*   y contains an array of pointers to 32-bit arrays of y values
*   y contains [y0 y1 y2 ... yn-1]
*   and each of the yi arrays contain [yi_0 yi_i ... yi_31].
*
* @param n - Number of points to interpolate
* @param xi - x coordinates for points (array of length n)
* @param yl - Length of y coordinate arrays
* @param yij - Array of n arrays of length yl
* @param x - Coordinate to interpolate at
* @returns The interpolated result of length yl
*/
function interpolate(n, xi, yl, yij, x) {
	const y = [];
	for (let i = 0; i < n; i++) y.push(/* @__PURE__ */ new Uint8Array(32));
	const values = /* @__PURE__ */ new Uint8Array(32);
	for (let i = 0; i < n; i++) y[i].set(yij[i].subarray(0, yl), 0);
	const lagrange = new Uint8Array(n);
	const ySlice = /* @__PURE__ */ new Uint32Array(8);
	const resultSlice = /* @__PURE__ */ new Uint32Array(8);
	const temp = /* @__PURE__ */ new Uint32Array(8);
	hazmatLagrangeBasis(lagrange, n, xi, x);
	bitsliceSetall(resultSlice, 0);
	for (let i = 0; i < n; i++) {
		bitslice(ySlice, y[i]);
		bitsliceSetall(temp, lagrange[i]);
		gf256Mul(temp, new Uint32Array(temp), ySlice);
		gf256Add(resultSlice, temp);
	}
	unbitslice(values, resultSlice);
	const result = new Uint8Array(yl);
	result.set(values.subarray(0, yl), 0);
	memzero(lagrange);
	memzero(ySlice);
	memzero(resultSlice);
	memzero(temp);
	memzeroVecVecU8(y);
	memzero(values);
	return result;
}
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
const SECRET_INDEX = 255;
const DIGEST_INDEX = 254;
function createDigest(randomData, sharedSecret) {
	return hmacSha256(randomData, sharedSecret);
}
function validateParameters(threshold, shareCount, secretLength) {
	if (shareCount > 16) throw new ShamirError("TooManyShares");
	else if (threshold < 1 || threshold > shareCount) throw new ShamirError("InvalidThreshold");
	else if (secretLength > 32) throw new ShamirError("SecretTooLong");
	else if (secretLength < 16) throw new ShamirError("SecretTooShort");
	else if ((secretLength & 1) !== 0) throw new ShamirError("SecretNotEvenLen");
}
/**
* Splits a secret into shares using the Shamir secret sharing algorithm.
*
* @param threshold - The minimum number of shares required to reconstruct the
*   secret. Must be greater than or equal to 1 and less than or equal to
*   shareCount.
* @param shareCount - The total number of shares to generate. Must be at least
*   threshold and less than or equal to MAX_SHARE_COUNT.
* @param secret - A Uint8Array containing the secret to be split. Must be at
*   least MIN_SECRET_LEN bytes long and at most MAX_SECRET_LEN bytes long.
*   The length must be an even number.
* @param randomGenerator - An implementation of the RandomNumberGenerator
*   interface, used to generate random data.
* @returns An array of Uint8Array representing the shares of the secret.
* @throws ShamirError if parameters are invalid
*
* @example
* ```typescript
* import { splitSecret } from "@blockchaincommons/shamir";
* import { SecureRandomNumberGenerator } from "@blockchaincommons/rand";
*
* const threshold = 2;
* const shareCount = 3;
* const secret = new TextEncoder().encode("my secret belongs to me.");
* const rng = new SecureRandomNumberGenerator();
*
* const shares = splitSecret(threshold, shareCount, secret, rng);
* console.log(shares.length); // 3
* ```
*/
function splitSecret(threshold, shareCount, secret, randomGenerator) {
	validateParameters(threshold, shareCount, secret.length);
	if (threshold === 1) {
		const result = [];
		for (let i = 0; i < shareCount; i++) result.push(new Uint8Array(secret));
		return result;
	} else {
		const x = new Uint8Array(shareCount);
		const y = [];
		for (let i = 0; i < shareCount; i++) y.push(new Uint8Array(secret.length));
		let n = 0;
		const result = [];
		for (let i = 0; i < shareCount; i++) result.push(new Uint8Array(secret.length));
		for (let index = 0; index < threshold - 2; index++) {
			randomGenerator.fillRandomData(result[index]);
			x[n] = index;
			y[n].set(result[index]);
			n++;
		}
		const digest = new Uint8Array(secret.length);
		randomGenerator.fillRandomData(digest.subarray(4));
		const d = createDigest(digest.subarray(4), secret);
		digest.set(d.subarray(0, 4), 0);
		x[n] = DIGEST_INDEX;
		y[n].set(digest);
		n++;
		x[n] = SECRET_INDEX;
		y[n].set(secret);
		n++;
		for (let index = threshold - 2; index < shareCount; index++) {
			const v = interpolate(n, x, secret.length, y, index);
			result[index].set(v);
		}
		memzero(digest);
		memzero(x);
		memzeroVecVecU8(y);
		return result;
	}
}
/**
* Recovers the secret from the given shares using the Shamir secret sharing
* algorithm.
*
* @param indexes - An array of indexes of the shares to be used for recovering
*   the secret. These are the indexes of the shares returned by splitSecret.
* @param shares - An array of shares of the secret matching the indexes in
*   indexes. These are the shares returned by splitSecret.
* @returns A Uint8Array representing the recovered secret.
* @throws ShamirError if parameters are invalid or checksum verification fails
*
* @example
* ```typescript
* import { recoverSecret } from "@blockchaincommons/shamir";
*
* const indexes = [0, 2];
* const shares = [
*   new Uint8Array([47, 165, 102, 232, ...]),
*   new Uint8Array([221, 174, 116, 201, ...]),
* ];
*
* const secret = recoverSecret(indexes, shares);
* console.log(new TextDecoder().decode(secret)); // "my secret belongs to me."
* ```
*/
function recoverSecret(indexes, shares) {
	const threshold = shares.length;
	if (threshold === 0 || indexes.length !== threshold) throw new ShamirError("InvalidThreshold");
	const shareLength = shares[0].length;
	validateParameters(threshold, threshold, shareLength);
	if (!shares.every((share) => share.length === shareLength)) throw new ShamirError("SharesUnequalLength");
	if (threshold === 1) return new Uint8Array(shares[0]);
	else {
		const indexesU8 = new Uint8Array(indexes);
		const digest = interpolate(threshold, indexesU8, shareLength, shares, DIGEST_INDEX);
		const secret = interpolate(threshold, indexesU8, shareLength, shares, SECRET_INDEX);
		const verify = createDigest(digest.subarray(4), secret);
		let valid = true;
		for (let i = 0; i < 4; i++) valid = valid && digest[i] === verify[i];
		memzero(digest);
		memzero(verify);
		if (!valid) throw new ShamirError("ChecksumFailure");
		return secret;
	}
}
//#endregion
//#region src/error.ts
/**
* Error types for SSKR operations.
*/
let SSKRErrorType = /* @__PURE__ */ function(SSKRErrorType) {
	SSKRErrorType["DuplicateMemberIndex"] = "DuplicateMemberIndex";
	SSKRErrorType["GroupSpecInvalid"] = "GroupSpecInvalid";
	SSKRErrorType["GroupCountInvalid"] = "GroupCountInvalid";
	SSKRErrorType["GroupThresholdInvalid"] = "GroupThresholdInvalid";
	SSKRErrorType["MemberCountInvalid"] = "MemberCountInvalid";
	SSKRErrorType["MemberThresholdInvalid"] = "MemberThresholdInvalid";
	SSKRErrorType["NotEnoughGroups"] = "NotEnoughGroups";
	SSKRErrorType["SecretLengthNotEven"] = "SecretLengthNotEven";
	SSKRErrorType["SecretTooLong"] = "SecretTooLong";
	SSKRErrorType["SecretTooShort"] = "SecretTooShort";
	SSKRErrorType["ShareLengthInvalid"] = "ShareLengthInvalid";
	SSKRErrorType["ShareReservedBitsInvalid"] = "ShareReservedBitsInvalid";
	SSKRErrorType["SharesEmpty"] = "SharesEmpty";
	SSKRErrorType["ShareSetInvalid"] = "ShareSetInvalid";
	SSKRErrorType["ShamirError"] = "ShamirError";
	return SSKRErrorType;
}({});
/**
* Error class for SSKR operations.
*/
var SSKRError = class SSKRError extends Error {
	type;
	shamirError;
	constructor(type, message, shamirError) {
		super(message ?? SSKRError.defaultMessage(type, shamirError));
		this.type = type;
		this.shamirError = shamirError;
		this.name = "SSKRError";
	}
	static defaultMessage(type, shamirError) {
		switch (type) {
			case "DuplicateMemberIndex": return "When combining shares, the provided shares contained a duplicate member index";
			case "GroupSpecInvalid": return "Invalid group specification.";
			case "GroupCountInvalid": return "When creating a split spec, the group count is invalid";
			case "GroupThresholdInvalid": return "SSKR group threshold is invalid";
			case "MemberCountInvalid": return "SSKR member count is invalid";
			case "MemberThresholdInvalid": return "SSKR member threshold is invalid";
			case "NotEnoughGroups": return "SSKR shares did not contain enough groups";
			case "SecretLengthNotEven": return "SSKR secret is not of even length";
			case "SecretTooLong": return "SSKR secret is too long";
			case "SecretTooShort": return "SSKR secret is too short";
			case "ShareLengthInvalid": return "SSKR shares did not contain enough serialized bytes";
			case "ShareReservedBitsInvalid": return "SSKR shares contained invalid reserved bits";
			case "SharesEmpty": return "SSKR shares were empty";
			case "ShareSetInvalid": return "SSKR shares were invalid";
			case "ShamirError": return shamirError != null ? `SSKR Shamir error: ${shamirError.message}` : "SSKR Shamir error";
		}
	}
	static fromShamirError(error) {
		return new SSKRError("ShamirError", void 0, error);
	}
};
//#endregion
//#region src/secret.ts
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
/**
* A secret to be split into shares.
*/
var Secret = class Secret {
	data;
	constructor(data) {
		this.data = data;
	}
	/**
	* Creates a new Secret instance with the given data.
	*
	* @param data - The secret data to be split into shares.
	* @returns A new Secret instance.
	* @throws SSKRError if the length of the secret is less than
	*   MIN_SECRET_LEN, greater than MAX_SECRET_LEN, or not even.
	*/
	static new(data) {
		const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
		const len = bytes.length;
		if (len < MIN_SECRET_LEN) throw new SSKRError("SecretTooShort");
		if (len > MAX_SECRET_LEN) throw new SSKRError("SecretTooLong");
		if ((len & 1) !== 0) throw new SSKRError("SecretLengthNotEven");
		return new Secret(new Uint8Array(bytes));
	}
	/**
	* Returns the length of the secret.
	*/
	len() {
		return this.data.length;
	}
	/**
	* Returns true if the secret is empty.
	*/
	isEmpty() {
		return this.len() === 0;
	}
	/**
	* Returns a reference to the secret data.
	*
	* Mirrors Rust's `Secret::data(&self) -> &[u8]`
	* (`bc-sskr-rust/src/secret.rs:43`).
	*/
	getData() {
		return this.data;
	}
	/**
	* Returns the secret data as a Uint8Array.
	*
	* Mirrors Rust's `impl AsRef<[u8]> for Secret`
	* (`bc-sskr-rust/src/secret.rs:46-49`). In Rust, `as_ref()` is
	* provided via the `AsRef<[u8]>` trait, which lets the `Secret` flow
	* naturally through any API expecting `impl AsRef<[u8]>`. TypeScript
	* has no equivalent of that trait, so we expose the same backing
	* buffer through both {@link getData} (the field accessor) and
	* `asRef` (the trait-style accessor) for ergonomic parity. Callers
	* may pick whichever name reads better at the call site.
	*/
	asRef() {
		return this.data;
	}
	/**
	* Check equality with another Secret.
	*/
	equals(other) {
		if (this.data.length !== other.data.length) return false;
		for (let i = 0; i < this.data.length; i++) if (this.data[i] !== other.data[i]) return false;
		return true;
	}
	/**
	* Clone the secret.
	*/
	clone() {
		return new Secret(new Uint8Array(this.data));
	}
};
//#endregion
//#region src/spec.ts
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
/**
* Strictly parses a non-negative integer string the way Rust's
* `<usize as FromStr>::from_str` does (`bc-sskr-rust/src/spec.rs:102, 108`).
*
* Accepts an optional leading `+` followed by one or more decimal digits.
* Rejects whitespace, decimals (`"2.5"`), trailing characters (`"2x"`),
* the `-` sign, and the empty string. Returns `undefined` on rejection so
* callers surface the appropriate `GroupSpecInvalid` error in the same
* spot Rust's `?` would.
*/
const STRICT_USIZE_RE = /^\+?\d+$/;
function parseStrictUsize(s) {
	if (!STRICT_USIZE_RE.test(s)) return void 0;
	const n = Number(s);
	return Number.isSafeInteger(n) ? n : void 0;
}
/**
* A specification for a group of shares within an SSKR split.
*/
var GroupSpec = class GroupSpec {
	_memberThreshold;
	_memberCount;
	constructor(memberThreshold, memberCount) {
		this._memberThreshold = memberThreshold;
		this._memberCount = memberCount;
	}
	/**
	* Creates a new GroupSpec instance with the given member threshold and count.
	*
	* @param memberThreshold - The minimum number of member shares required to
	*   reconstruct the secret within the group.
	* @param memberCount - The total number of member shares in the group.
	* @returns A new GroupSpec instance.
	* @throws SSKRError if the member count is zero, if the member count is
	*   greater than the maximum share count, or if the member threshold is
	*   greater than the member count.
	*/
	static new(memberThreshold, memberCount) {
		if (memberCount === 0) throw new SSKRError("MemberCountInvalid");
		if (memberCount > 16) throw new SSKRError("MemberCountInvalid");
		if (memberThreshold > memberCount) throw new SSKRError("MemberThresholdInvalid");
		return new GroupSpec(memberThreshold, memberCount);
	}
	/**
	* Returns the member share threshold for this group.
	*/
	memberThreshold() {
		return this._memberThreshold;
	}
	/**
	* Returns the number of member shares in this group.
	*/
	memberCount() {
		return this._memberCount;
	}
	/**
	* Parses a group specification from a string.
	* Format: `"M-of-N"` where `M` is the threshold and `N` is the count.
	*
	* Mirrors Rust's `GroupSpec::parse` (`bc-sskr-rust/src/spec.rs:97-112`),
	* which calls `parts[0].parse::<usize>()`. Rust's `usize::FromStr` is
	* strict: it rejects whitespace, decimals, trailing characters, and the
	* `-` sign, accepting only an optional `+` prefix followed by digits.
	* We mirror that with the regex `^\+?\d+$` so strings like `"2.5"`,
	* `"2x"`, `" 2"`, `"-2"`, and `""` all surface
	* {@link SSKRErrorType.GroupSpecInvalid} on both sides.
	*/
	static parse(s) {
		const parts = s.split("-");
		if (parts.length !== 3) throw new SSKRError("GroupSpecInvalid");
		const memberThreshold = parseStrictUsize(parts[0]);
		if (memberThreshold === void 0) throw new SSKRError("GroupSpecInvalid");
		if (parts[1] !== "of") throw new SSKRError("GroupSpecInvalid");
		const memberCount = parseStrictUsize(parts[2]);
		if (memberCount === void 0) throw new SSKRError("GroupSpecInvalid");
		return GroupSpec.new(memberThreshold, memberCount);
	}
	/**
	* Creates a default GroupSpec (1-of-1).
	*/
	static default() {
		return GroupSpec.new(1, 1);
	}
	/**
	* Returns a string representation of the group spec.
	*/
	toString() {
		return `${this._memberThreshold}-of-${this._memberCount}`;
	}
};
/**
* A specification for an SSKR split.
*/
var Spec = class Spec {
	_groupThreshold;
	_groups;
	constructor(groupThreshold, groups) {
		this._groupThreshold = groupThreshold;
		this._groups = groups;
	}
	/**
	* Creates a new Spec instance with the given group threshold and groups.
	*
	* @param groupThreshold - The minimum number of groups required to
	*   reconstruct the secret.
	* @param groups - The list of GroupSpec instances that define the groups
	*   and their members.
	* @returns A new Spec instance.
	* @throws SSKRError if the group threshold is zero, if the group threshold
	*   is greater than the number of groups, or if the number of groups is
	*   greater than the maximum share count.
	*/
	static new(groupThreshold, groups) {
		if (groupThreshold === 0) throw new SSKRError("GroupThresholdInvalid");
		if (groupThreshold > groups.length) throw new SSKRError("GroupThresholdInvalid");
		if (groups.length > 16) throw new SSKRError("GroupCountInvalid");
		return new Spec(groupThreshold, groups);
	}
	/**
	* Returns the group threshold.
	*/
	groupThreshold() {
		return this._groupThreshold;
	}
	/**
	* Returns a slice of the group specifications.
	*/
	groups() {
		return this._groups;
	}
	/**
	* Returns the number of groups.
	*/
	groupCount() {
		return this._groups.length;
	}
	/**
	* Returns the total number of shares across all groups.
	*/
	shareCount() {
		return this._groups.reduce((sum, g) => sum + g.memberCount(), 0);
	}
};
//#endregion
//#region ../bc-rand-ts/tests/baseline/rand-baseline.mjs
/**
* Returns the Web Crypto API for the current environment. Available natively
* in browsers and in Node.js >= 15 via `globalThis.crypto`.
*/
function getCrypto() {
	if (typeof globalThis !== "undefined" && globalThis.crypto != null) return globalThis.crypto;
	throw new Error("No crypto API available in this environment");
}
/**
* Generate a Uint8Array of cryptographically strong random bytes of the given size.
*/
function randomData(size) {
	const data = new Uint8Array(size);
	fillRandomData(data);
	return data;
}
/**
* Fill the given Uint8Array with cryptographically strong random bytes.
*/
function fillRandomData(data) {
	getCrypto().getRandomValues(data);
}
/**
* Returns the next cryptographically strong random 64-bit unsigned integer.
*
* This mirrors Rust's module-private `secure_random::next_u64()` and is not
* re-exported from the package surface (matches Rust `lib.rs` behavior).
*/
function nextU64() {
	const data = /* @__PURE__ */ new Uint8Array(8);
	fillRandomData(data);
	return new DataView(data.buffer).getBigUint64(0, true);
}
/**
* A random number generator that can be used as a source of
* cryptographically-strong randomness.
*
* Uses the Web Crypto API (crypto.getRandomValues) which is available
* in both browsers and Node.js >= 15.
*/
var SecureRandomNumberGenerator = class {
	/**
	* Returns the next random 32-bit unsigned integer.
	*
	* Mirrors Rust's `next_u32` impl which returns `next_u64() as u32` —
	* the low 32 bits of a 64-bit draw.
	*/
	nextU32() {
		return Number(this.nextU64() & 4294967295n) >>> 0;
	}
	/**
	* Returns the next random 64-bit unsigned integer as a bigint.
	*/
	nextU64() {
		return nextU64();
	}
	/**
	* Fills the given Uint8Array with random bytes.
	*/
	fillBytes(dest) {
		fillRandomData(dest);
	}
	/**
	* Returns a Uint8Array of random bytes of the given size.
	*/
	randomData(size) {
		return randomData(size);
	}
	/**
	* Fills the given Uint8Array with random bytes.
	*/
	fillRandomData(data) {
		fillRandomData(data);
	}
};
//#endregion
//#region src/share.ts
/**
* A share in the SSKR scheme.
*/
var SSKRShare = class {
	_identifier;
	_groupIndex;
	_groupThreshold;
	_groupCount;
	_memberIndex;
	_memberThreshold;
	_value;
	constructor(identifier, groupIndex, groupThreshold, groupCount, memberIndex, memberThreshold, value) {
		this._identifier = identifier;
		this._groupIndex = groupIndex;
		this._groupThreshold = groupThreshold;
		this._groupCount = groupCount;
		this._memberIndex = memberIndex;
		this._memberThreshold = memberThreshold;
		this._value = value;
	}
	identifier() {
		return this._identifier;
	}
	groupIndex() {
		return this._groupIndex;
	}
	groupThreshold() {
		return this._groupThreshold;
	}
	groupCount() {
		return this._groupCount;
	}
	memberIndex() {
		return this._memberIndex;
	}
	memberThreshold() {
		return this._memberThreshold;
	}
	value() {
		return this._value;
	}
};
//#endregion
//#region src/encoding.ts
/**
* Generates SSKR shares for the given Spec and Secret.
*
* @param spec - The Spec instance that defines the group and member thresholds.
* @param masterSecret - The Secret instance to be split into shares.
* @returns A vector of groups, each containing a vector of shares,
*   each of which is a Uint8Array.
*/
function sskrGenerate(spec, masterSecret) {
	return sskrGenerateUsing(spec, masterSecret, new SecureRandomNumberGenerator());
}
/**
* Generates SSKR shares for the given Spec and Secret using the provided
* random number generator.
*
* @param spec - The Spec instance that defines the group and member thresholds.
* @param masterSecret - The Secret instance to be split into shares.
* @param randomGenerator - The random number generator to use for generating
*   shares.
* @returns A vector of groups, each containing a vector of shares,
*   each of which is a Uint8Array.
*/
function sskrGenerateUsing(spec, masterSecret, randomGenerator) {
	return generateShares(spec, masterSecret, randomGenerator).map((group) => group.map(serializeShare));
}
/**
* Combines the given SSKR shares into a Secret.
*
* @param shares - A array of SSKR shares to be combined.
* @returns The reconstructed Secret.
* @throws SSKRError if the shares do not meet the necessary quorum of groups
*   and member shares within each group.
*/
function sskrCombine(shares) {
	const sskrShares = [];
	for (const share of shares) {
		const sskrShare = deserializeShare(share);
		sskrShares.push(sskrShare);
	}
	return combineShares(sskrShares);
}
function serializeShare(share) {
	const valueData = share.value().getData();
	const result = new Uint8Array(valueData.length + 5);
	const id = share.identifier();
	const gt = share.groupThreshold() - 1 & 15;
	const gc = share.groupCount() - 1 & 15;
	const gi = share.groupIndex() & 15;
	const mt = share.memberThreshold() - 1 & 15;
	const mi = share.memberIndex() & 15;
	const id1 = id >> 8;
	const id2 = id & 255;
	result[0] = id1;
	result[1] = id2;
	result[2] = gt << 4 | gc;
	result[3] = gi << 4 | mt;
	result[4] = mi;
	result.set(valueData, 5);
	return result;
}
function deserializeShare(source) {
	if (source.length < 5) throw new SSKRError("ShareLengthInvalid");
	const groupThreshold = (source[2] >> 4) + 1;
	const groupCount = (source[2] & 15) + 1;
	if (groupThreshold > groupCount) throw new SSKRError("GroupThresholdInvalid");
	const identifier = source[0] << 8 | source[1];
	const groupIndex = source[3] >> 4;
	const memberThreshold = (source[3] & 15) + 1;
	if (source[4] >> 4 !== 0) throw new SSKRError("ShareReservedBitsInvalid");
	return new SSKRShare(identifier, groupIndex, groupThreshold, groupCount, source[4] & 15, memberThreshold, Secret.new(source.subarray(5)));
}
function generateShares(spec, masterSecret, randomGenerator) {
	const identifierBytes = /* @__PURE__ */ new Uint8Array(2);
	randomGenerator.fillRandomData(identifierBytes);
	const identifier = identifierBytes[0] << 8 | identifierBytes[1];
	const groupsShares = [];
	let groupSecrets;
	try {
		groupSecrets = splitSecret(spec.groupThreshold(), spec.groupCount(), masterSecret.getData(), randomGenerator);
	} catch (e) {
		if (e instanceof ShamirError) throw SSKRError.fromShamirError(e);
		throw e;
	}
	for (let groupIndex = 0; groupIndex < spec.groups().length; groupIndex++) {
		const group = spec.groups()[groupIndex];
		const groupSecret = groupSecrets[groupIndex];
		let memberSecrets;
		try {
			memberSecrets = splitSecret(group.memberThreshold(), group.memberCount(), groupSecret, randomGenerator);
		} catch (e) {
			if (e instanceof ShamirError) throw SSKRError.fromShamirError(e);
			throw e;
		}
		const memberSSKRShares = memberSecrets.map((memberSecret, memberIndex) => {
			const secret = Secret.new(memberSecret);
			return new SSKRShare(identifier, groupIndex, spec.groupThreshold(), spec.groupCount(), memberIndex, group.memberThreshold(), secret);
		});
		groupsShares.push(memberSSKRShares);
	}
	return groupsShares;
}
function combineShares(shares) {
	let identifier = 0;
	let groupThreshold = 0;
	let groupCount = 0;
	if (shares.length === 0) throw new SSKRError("SharesEmpty");
	let nextGroup = 0;
	const groups = [];
	let secretLen = 0;
	for (let i = 0; i < shares.length; i++) {
		const share = shares[i];
		if (i === 0) {
			identifier = share.identifier();
			groupCount = share.groupCount();
			groupThreshold = share.groupThreshold();
			secretLen = share.value().len();
		} else if (share.identifier() !== identifier || share.groupThreshold() !== groupThreshold || share.groupCount() !== groupCount || share.value().len() !== secretLen) throw new SSKRError("ShareSetInvalid");
		let groupFound = false;
		for (const group of groups) if (share.groupIndex() === group.groupIndex) {
			groupFound = true;
			if (share.memberThreshold() !== group.memberThreshold) throw new SSKRError("MemberThresholdInvalid");
			for (const memberIndex of group.memberIndexes) if (share.memberIndex() === memberIndex) throw new SSKRError("DuplicateMemberIndex");
			if (group.memberIndexes.length < group.memberThreshold) {
				group.memberIndexes.push(share.memberIndex());
				group.memberShares.push(share.value().clone());
			}
		}
		if (!groupFound) {
			const g = {
				groupIndex: share.groupIndex(),
				memberThreshold: share.memberThreshold(),
				memberIndexes: [share.memberIndex()],
				memberShares: [share.value().clone()]
			};
			groups.push(g);
			nextGroup++;
		}
	}
	if (nextGroup < groupThreshold) throw new SSKRError("NotEnoughGroups");
	const masterIndexes = [];
	const masterShares = [];
	for (const group of groups) {
		if (group.memberIndexes.length < group.memberThreshold) continue;
		try {
			const memberSharesData = group.memberShares.map((s) => s.getData());
			const groupSecret = recoverSecret(group.memberIndexes, memberSharesData);
			masterIndexes.push(group.groupIndex);
			masterShares.push(groupSecret);
		} catch (e) {
			if (e instanceof ShamirError) continue;
			throw e;
		}
		if (masterIndexes.length === groupThreshold) break;
	}
	if (masterIndexes.length < groupThreshold) throw new SSKRError("NotEnoughGroups");
	let masterSecretData;
	try {
		masterSecretData = recoverSecret(masterIndexes, masterShares);
	} catch (e) {
		if (e instanceof ShamirError) throw SSKRError.fromShamirError(e);
		throw e;
	}
	return Secret.new(masterSecretData);
}
//#endregion
//#region src/index.ts
/**
* Copyright © 2023-2026 Blockchain Commons, LLC
*
*/
/**
* The minimum length of a secret.
*/
const MIN_SECRET_LEN = 16;
/**
* The maximum length of a secret.
*/
const MAX_SECRET_LEN = 32;
/**
* The maximum number of shares that can be generated from a secret.
*/
const MAX_SHARE_COUNT = 16;
/**
* The maximum number of groups in a split.
*/
const MAX_GROUPS_COUNT = MAX_SHARE_COUNT;
/**
* The number of bytes used to encode the metadata for a share.
*/
const METADATA_SIZE_BYTES = 5;
/**
* The minimum number of bytes required to encode a share.
*/
const MIN_SERIALIZE_SIZE_BYTES = 21;
//#endregion
export { GroupSpec, MAX_GROUPS_COUNT, MAX_SECRET_LEN, MAX_SHARE_COUNT, METADATA_SIZE_BYTES, MIN_SECRET_LEN, MIN_SERIALIZE_SIZE_BYTES, SSKRError, SSKRErrorType, Secret, Spec, sskrCombine, sskrGenerate, sskrGenerateUsing };
