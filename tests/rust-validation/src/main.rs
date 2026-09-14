//! Replays a vector file (tests/vectors/vectors.json, the full corpus or the
//! header sweep) against sskr 0.12.0 over bc-rand 0.5.0 and bc-shamir 0.13.0.
//!
//!   cargo run --release --offline -- ../vectors/vectors.json
//!
//! Exit 0 iff every vector matches or is js-only. There is no divergence
//! allowance: a compared outcome that differs is a MISMATCH.
//!
//! Outcomes are share bytes (`hex,hex;hex,…`, groups separated by `;`; the
//! steps of a consecutive-generation recipe by ` | `), the recovered secret,
//! `GroupSpec::parse`'s `Display`, `gc=<n>,sc=<n>,groups=<g,…>` for a spec,
//! `len=<n>` for a secret, or `throw:<code>:<Display>` where the code is the
//! `Error` variant, a wrapped Shamir failure spelled `Shamir(<variant>)`.
//!
//! Integer classification. A recipe integer is compared when it has an exact
//! Rust form:
//! - a JSON number serde reads as a `u64` is compared, whatever its size:
//!   every check the reference makes compares a spec field with at most 16 or
//!   with the group count, so a `u64` read from the decimal digits and the
//!   double JavaScript received have the same outcome. Any other JSON number
//!   (NaN, a fraction, a negative, a value above `u64::MAX`) is js-only;
//! - a `"<digits>n"` string is a `bigint`, compared when the digits fit a
//!   `u64` (js-only when negative or above `u64::MAX`);
//! - `"NaN"`, `"Infinity"` and `"-Infinity"` are js-only;
//! - a hand-built share header (`shareBytes`) is js-only: `SSKRShare` is
//!   crate-private, so no reference caller can build one.
//! Any other field shape is unparsable: counted, reported, and a failure.
//! Every vector runs inside its own `catch_unwind`, so a malformed file cannot
//! abort the run. `usize` is asserted to be 64 bits so that every compared
//! integer is the value the reference receives.
use bc_rand::{RandomNumberGenerator, SeededRandomNumberGenerator};
use serde::Deserialize;
use serde_json::Value;
use sskr::{sskr_combine, sskr_generate_using, GroupSpec, Secret, Spec};
use std::panic::{catch_unwind, AssertUnwindSafe};

/// The counter generator the crate's tests use: 0, 17, 34, … (wrapping),
/// restarting at 0 for every fill.
struct Fake;
impl rand_core::RngCore for Fake {
    fn next_u32(&mut self) -> u32 { unimplemented!() }
    fn next_u64(&mut self) -> u64 { unimplemented!() }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut b: u8 = 0;
        for x in dest.iter_mut() { *x = b; b = b.wrapping_add(17); }
    }
}
impl rand_core::CryptoRng for Fake {}
impl RandomNumberGenerator for Fake {}

#[derive(Deserialize)]
struct File { count: usize, vectors: Vec<Vector> }
#[derive(Deserialize)]
struct Vector { name: String, recipe: Value, expect: String }

/// Why a recipe did not produce an outcome: it is malformed, or the
/// reference returned an error (which *is* the outcome).
enum Fail { Unparsable(String), Sskr(sskr::Error) }
impl From<sskr::Error> for Fail { fn from(e: sskr::Error) -> Self { Fail::Sskr(e) } }
impl From<String> for Fail { fn from(s: String) -> Self { Fail::Unparsable(s) } }
impl From<&str> for Fail { fn from(s: &str) -> Self { Fail::Unparsable(s.to_string()) } }
type R<T> = Result<T, Fail>;

/// A recipe integer's Rust form.
enum Int { Exact(u64), JsOnly }

fn int(v: &Value) -> R<Int> {
    match v {
        Value::Number(_) => Ok(match v.as_u64() { Some(n) => Int::Exact(n), None => Int::JsOnly }),
        Value::String(s) => {
            if s == "NaN" || s == "Infinity" || s == "-Infinity" { return Ok(Int::JsOnly); }
            let Some(body) = s.strip_suffix('n') else { return Err(format!("{s:?} is not an integer").into()) };
            let (negative, digits) = match body.strip_prefix('-') {
                Some(d) => (true, d),
                None => (false, body),
            };
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                return Err(format!("{s:?} is not a bigint").into());
            }
            Ok(match digits.parse::<u64>() {
                Ok(0) => Int::Exact(0),
                Ok(_) if negative => Int::JsOnly,
                Ok(n) => Int::Exact(n),
                Err(_) => Int::JsOnly,
            })
        }
        _ => Err(format!("{v} is not an integer").into()),
    }
}
fn field<'a>(v: &'a Value, key: &str) -> R<&'a Value> {
    v.get(key).ok_or_else(|| Fail::Unparsable(format!("missing field {key:?}")))
}
fn array<'a>(v: &'a Value, key: &str) -> R<&'a Vec<Value>> {
    field(v, key)?.as_array().ok_or_else(|| Fail::Unparsable(format!("{key:?} is not an array")))
}
fn string<'a>(v: &'a Value, key: &str) -> R<&'a str> {
    field(v, key)?.as_str().ok_or_else(|| Fail::Unparsable(format!("{key:?} is not a string")))
}
/// An integer that must be exact: a compared spec field, a pick or a corruption.
fn u(v: &Value) -> R<usize> {
    match int(v)? {
        Int::Exact(n) => usize::try_from(n).map_err(|_| Fail::Unparsable(format!("{n} does not fit a usize"))),
        Int::JsOnly => Err(format!("{v} has no exact Rust form").into()),
    }
}
/// A `Bytes` spec (`hex`, `text`, or `cycle`/`start`).
fn bytes(v: &Value) -> R<Vec<u8>> {
    if let Some(h) = v.get("hex") {
        let h = h.as_str().ok_or("\"hex\" is not a string")?;
        return hex::decode(h).map_err(|e| Fail::Unparsable(format!("bad hex: {e}")));
    }
    if let Some(t) = v.get("text") {
        return Ok(t.as_str().ok_or("\"text\" is not a string")?.as_bytes().to_vec());
    }
    let n = u(field(v, "cycle")?)?;
    let start = match v.get("start") { Some(s) => u(s)?, None => 0 };
    Ok((0..n).map(|i| ((start + i) & 0xff) as u8).collect())
}
/// Whether a spec shape holds a field the reference cannot receive.
fn spec_js_only(v: &Value) -> R<bool> {
    let mut js = matches!(int(field(v, "gt")?)?, Int::JsOnly);
    for g in array(v, "groups")? {
        js |= matches!(int(field(g, "mt")?)?, Int::JsOnly);
        js |= matches!(int(field(g, "mc")?)?, Int::JsOnly);
    }
    Ok(js)
}
/// A generator spec: the counter generator, or exactly four decimal `u64` seed words.
fn check_rng(v: &Value) -> R<()> {
    if v.get("fake") == Some(&Value::Bool(true)) { return Ok(()); }
    let words = array(v, "seed")?;
    if words.len() != 4 || !words.iter().all(|w| w.as_str().is_some_and(|s| s.parse::<u64>().is_ok())) {
        return Err("\"seed\" must be four decimal u64 strings".into());
    }
    Ok(())
}
/// A generation recipe (`spec`, `secret`, `rng`, optional `then` steps of `spec` and `secret`).
fn generation_js_only(v: &Value) -> R<bool> {
    let mut js = spec_js_only(field(v, "spec")?)?;
    bytes(field(v, "secret")?)?;
    check_rng(field(v, "rng")?)?;
    if let Some(then) = v.get("then") {
        for step in then.as_array().ok_or("\"then\" is not an array")? {
            js |= spec_js_only(field(step, "spec")?)?;
            bytes(field(step, "secret")?)?;
        }
    }
    Ok(js)
}
/// True when the recipe has an input the reference cannot receive; Err when it is malformed.
fn js_only(r: &Value) -> R<bool> {
    match string(r, "k")? {
        "shareBytes" => Ok(true),
        "spec" => spec_js_only(field(r, "spec")?),
        "generate" => generation_js_only(r),
        "combine" => match r.get("from") {
            Some(from) => generation_js_only(from),
            None => { for s in array(r, "shares")? { bytes(s)?; } Ok(false) }
        },
        "parse" => { string(r, "s")?; Ok(false) }
        "secret" => { bytes(field(r, "data")?)?; Ok(false) }
        k => Err(format!("unknown recipe kind {k:?}").into()),
    }
}
/// `sskr::Error` → the TypeScript code: the variant name, `ShamirError(X)` as `Shamir(X)`.
fn code(e: &sskr::Error) -> String {
    match e {
        sskr::Error::ShamirError(inner) => format!("Shamir({inner:?})"),
        other => format!("{other:?}"),
    }
}
fn throw(e: &sskr::Error) -> String { format!("throw:{}:{e}", code(e)) }

fn spec_of(v: &Value) -> R<Spec> {
    let mut groups = Vec::new();
    for g in array(v, "groups")? {
        groups.push(GroupSpec::new(u(field(g, "mt")?)?, u(field(g, "mc")?)?)?);
    }
    Ok(Spec::new(u(field(v, "gt")?)?, groups)?)
}
fn seeded(v: &Value) -> R<SeededRandomNumberGenerator> {
    check_rng(v)?;
    let words: Vec<u64> = array(v, "seed")?.iter().map(|w| w.as_str().unwrap_or("").parse().unwrap_or(0)).collect();
    Ok(SeededRandomNumberGenerator::new([words[0], words[1], words[2], words[3]]))
}
fn hex_join(groups: &[Vec<Vec<u8>>]) -> String {
    groups.iter().map(|g| g.iter().map(hex::encode).collect::<Vec<_>>().join(",")).collect::<Vec<_>>().join(";")
}
/// One generation step (`spec` and `secret`) drawing from `g`.
fn generate_step(step: &Value, g: &mut impl RandomNumberGenerator) -> R<Vec<Vec<Vec<u8>>>> {
    let spec = spec_of(field(step, "spec")?)?;
    let secret = Secret::new(bytes(field(step, "secret")?)?)?;
    Ok(sskr_generate_using(&spec, &secret, g)?)
}
/// The steps of a generation recipe: the recipe itself, then each `then` entry.
fn steps(gs: &Value) -> R<Vec<&Value>> {
    let mut out = vec![gs];
    if let Some(then) = gs.get("then") {
        out.extend(then.as_array().ok_or("\"then\" is not an array")?.iter());
    }
    Ok(out)
}
/// A generation recipe run on one generator; every step's outcome, joined by ` | `.
fn generate_recipe(gs: &Value) -> R<String> {
    fn go(gs: &Value, g: &mut impl RandomNumberGenerator) -> R<String> {
        let mut outcomes = Vec::new();
        for step in steps(gs)? {
            outcomes.push(match generate_step(step, g) {
                Ok(groups) => hex_join(&groups),
                Err(Fail::Sskr(e)) => throw(&e),
                Err(other) => return Err(other),
            });
        }
        Ok(outcomes.join(" | "))
    }
    let rng = field(gs, "rng")?;
    if rng.get("fake").is_some() { go(gs, &mut Fake) } else { go(gs, &mut seeded(rng)?) }
}
/// The first step of a generation recipe, for a combine recipe's `from`.
fn generate(gs: &Value) -> R<Vec<Vec<Vec<u8>>>> {
    let rng = field(gs, "rng")?;
    if rng.get("fake").is_some() { generate_step(gs, &mut Fake) } else { generate_step(gs, &mut seeded(rng)?) }
}
fn combine(r: &Value) -> R<String> {
    let shares: Vec<Vec<u8>> = if let Some(sh) = r.get("shares") {
        sh.as_array().ok_or("\"shares\" is not an array")?.iter().map(bytes).collect::<R<_>>()?
    } else {
        let all = generate(field(r, "from")?)?;
        let mut picked = Vec::new();
        for p in array(r, "pick")? {
            let pair = p.as_array().filter(|a| a.len() == 2).ok_or("a pick is not a [group, member] pair")?;
            let (gi, mi) = (u(&pair[0])?, u(&pair[1])?);
            let share = all.get(gi).and_then(|g| g.get(mi)).ok_or_else(|| Fail::Unparsable(format!("pick [{gi}, {mi}] is out of range")))?;
            picked.push(share.clone());
        }
        if let Some(c) = r.get("corrupt") {
            let (si, bi, mask) = (u(field(c, "share")?)?, u(field(c, "byte")?)?, u(field(c, "mask")?)?);
            let mask = u8::try_from(mask).map_err(|_| Fail::Unparsable(format!("mask {mask} is not a byte")))?;
            let target = picked.get_mut(si).and_then(|s| s.get_mut(bi)).ok_or_else(|| Fail::Unparsable(format!("corrupt ({si}, {bi}) is out of range")))?;
            *target ^= mask;
        }
        picked
    };
    Ok(hex::encode(sskr_combine(&shares)?.data()))
}
fn run(r: &Value) -> R<String> {
    match string(r, "k")? {
        "generate" => generate_recipe(r),
        "combine" => combine(r),
        "parse" => Ok(GroupSpec::parse(string(r, "s")?)?.to_string()),
        "spec" => {
            let s = spec_of(field(r, "spec")?)?;
            let groups: Vec<String> = s.groups().iter().map(ToString::to_string).collect();
            Ok(format!("gc={},sc={},groups={}", s.group_count(), s.share_count(), groups.join(",")))
        }
        "secret" => Ok(format!("len={}", Secret::new(bytes(field(r, "data")?)?)?.len())),
        k => Err(format!("unknown recipe kind {k:?}").into()),
    }
}

enum Verdict { Match, JsOnly, Mismatch(String), Unparsable(String) }

fn evaluate(v: &Vector) -> Verdict {
    let outcome = catch_unwind(AssertUnwindSafe(|| -> R<Option<String>> {
        if js_only(&v.recipe)? { return Ok(None); }
        match run(&v.recipe) {
            Ok(s) => Ok(Some(s)),
            Err(Fail::Sskr(e)) => Ok(Some(throw(&e))),
            Err(other) => Err(other),
        }
    }));
    match outcome {
        Err(payload) => {
            let reason = payload.downcast_ref::<&str>().map(|s| s.to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "panic".into());
            Verdict::Unparsable(format!("panic: {reason}"))
        }
        Ok(Err(Fail::Unparsable(reason))) => Verdict::Unparsable(reason),
        Ok(Err(Fail::Sskr(e))) => Verdict::Unparsable(format!("unexpected reference error {e:?}")),
        Ok(Ok(None)) => Verdict::JsOnly,
        Ok(Ok(Some(got))) if got == v.expect => Verdict::Match,
        Ok(Ok(Some(got))) => Verdict::Mismatch(got),
    }
}
fn clip(s: &str) -> String {
    const MAX: usize = 200;
    if s.len() <= MAX { s.to_string() } else { format!("{}… ({} chars)", &s[..MAX], s.len()) }
}

fn main() {
    assert_eq!(usize::BITS, 64, "the reference's usize is 64-bit; build the harness for a 64-bit target");
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: sskr-validation <vectors.json>");
        std::process::exit(2);
    };
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) => { eprintln!("cannot read {path}: {e}"); std::process::exit(2); }
    };
    let file: File = match serde_json::from_str(&text) {
        Ok(f) => f,
        Err(e) => { eprintln!("{path} is not a vector file: {e}"); std::process::exit(2); }
    };
    if file.count != file.vectors.len() {
        eprintln!("count {} does not equal the number of vectors ({})", file.count, file.vectors.len());
        std::process::exit(2);
    }
    let (mut ok, mut js_only, mut mismatch, mut unparsable) = (0, 0, 0, 0);
    for v in &file.vectors {
        match evaluate(v) {
            Verdict::Match => ok += 1,
            Verdict::JsOnly => js_only += 1,
            Verdict::Mismatch(got) => {
                mismatch += 1;
                eprintln!("MISMATCH {}\n  rust: {}\n  ts:   {}", v.name, clip(&got), clip(&v.expect));
            }
            Verdict::Unparsable(reason) => {
                unparsable += 1;
                eprintln!("UNPARSABLE {}: {reason}", v.name);
            }
        }
    }
    let tail = if unparsable > 0 { format!(", {unparsable} unparsable") } else { String::new() };
    println!("{} vectors - {ok} match, {js_only} js-only, {mismatch} MISMATCH{tail}", file.vectors.len());
    std::process::exit(if mismatch == 0 && unparsable == 0 { 0 } else { 1 });
}
