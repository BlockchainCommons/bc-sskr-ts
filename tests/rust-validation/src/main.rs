//! Replays tests/vectors/vectors.json against sskr 0.12.0.
//!
//!   cargo run --release -- ../vectors/vectors.json
use bc_rand::{RandomNumberGenerator, SeededRandomNumberGenerator};
use serde::Deserialize;
use sskr::{sskr_combine, sskr_generate_using, GroupSpec, Secret, Spec};
use std::panic::{catch_unwind, AssertUnwindSafe};

/// The counter generator the crate's tests use: 0, 17, 34, … (wrapping).
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
struct Vector { name: String, recipe: serde_json::Value, expect: String }

fn bytes(v: &serde_json::Value) -> Vec<u8> {
    if let Some(h) = v.get("hex") { return hex::decode(h.as_str().unwrap()).unwrap(); }
    if let Some(t) = v.get("text") { return t.as_str().unwrap().as_bytes().to_vec(); }
    let n = v["cycle"].as_u64().unwrap() as usize;
    let start = v.get("start").and_then(|s| s.as_u64()).unwrap_or(0) as usize;
    (0..n).map(|i| ((start + i) & 0xff) as u8).collect()
}
/// sskr::Error variant → the TypeScript code (`ShamirError(_)` → `Shamir`).
fn code(e: &sskr::Error) -> String {
    let d = format!("{e:?}");
    let name = d.split('(').next().unwrap_or(&d);
    if name == "ShamirError" { "Shamir".into() } else { name.to_string() }
}
type R<T> = Result<T, sskr::Error>;

fn spec_of(v: &serde_json::Value) -> R<Spec> {
    let groups: R<Vec<GroupSpec>> = v["groups"].as_array().unwrap().iter()
        .map(|g| GroupSpec::new(g["mt"].as_u64().unwrap() as usize, g["mc"].as_u64().unwrap() as usize)).collect();
    Spec::new(v["gt"].as_u64().unwrap() as usize, groups?)
}
fn generate(gs: &serde_json::Value) -> R<Vec<Vec<Vec<u8>>>> {
    let spec = spec_of(&gs["spec"])?;
    let secret = Secret::new(bytes(&gs["secret"]))?;
    let rng = &gs["rng"];
    if rng.get("fake").is_some() {
        sskr_generate_using(&spec, &secret, &mut Fake)
    } else {
        let s: Vec<u64> = rng["seed"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().parse().unwrap()).collect();
        let mut g = SeededRandomNumberGenerator::new([s[0], s[1], s[2], s[3]]);
        sskr_generate_using(&spec, &secret, &mut g)
    }
}
fn run(r: &serde_json::Value) -> String {
    let out = catch_unwind(AssertUnwindSafe(|| -> String {
        let res: R<String> = (|| {
            Ok(match r["k"].as_str().unwrap() {
                "generate" => generate(r)?.iter().map(|g| g.iter().map(hex::encode).collect::<Vec<_>>().join(",")).collect::<Vec<_>>().join(";"),
                "combine" => {
                    let shares: Vec<Vec<u8>> = if let Some(sh) = r.get("shares") {
                        sh.as_array().unwrap().iter().map(bytes).collect()
                    } else {
                        let all = generate(&r["from"])?;
                        let mut picked: Vec<Vec<u8>> = r["pick"].as_array().unwrap().iter()
                            .map(|p| all[p[0].as_u64().unwrap() as usize][p[1].as_u64().unwrap() as usize].clone()).collect();
                        if let Some(c) = r.get("corrupt") {
                            picked[c["share"].as_u64().unwrap() as usize][c["byte"].as_u64().unwrap() as usize] ^= c["mask"].as_u64().unwrap() as u8;
                        }
                        picked
                    };
                    hex::encode(sskr_combine(&shares)?.data())
                }
                "parse" => { let g = GroupSpec::parse(r["s"].as_str().unwrap())?; format!("{}-of-{}", g.member_threshold(), g.member_count()) }
                "spec" => { let s = spec_of(&r["spec"])?; format!("gc={},sc={}", s.group_count(), s.share_count()) }
                "secret" => format!("len={}", Secret::new(bytes(&r["data"]))?.len()),
                k => panic!("unknown recipe {k}"),
            })
        })();
        match res { Ok(s) => s, Err(e) => format!("throw:{}", code(&e)) }
    }));
    out.unwrap_or_else(|_| "throw:panic".into())
}

fn main() {
    let path = std::env::args().nth(1).expect("path");
    let file: File = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(file.count, file.vectors.len());
    let (mut ok, mut mismatch) = (0, 0);
    for v in &file.vectors {
        let got = run(&v.recipe);
        if got == v.expect { ok += 1; } else { mismatch += 1; eprintln!("MISMATCH {}\n  rust: {}\n  ts:   {}", v.name, &got[..got.len().min(120)], &v.expect[..v.expect.len().min(120)]); }
    }
    println!("{} vectors - {ok} match, {mismatch} MISMATCH", file.vectors.len());
    std::process::exit(if mismatch == 0 { 0 } else { 1 });
}
