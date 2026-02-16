//! Bridge parity test — verifies that ffi.rs and mod.rs declare the exact
//! same set of `#[qinvokable]` functions.  Any drift between the two files
//! causes a compile-time or runtime failure in cxx-qt, so this test serves
//! as a fast, regex-based early-warning system.

use regex::Regex;
use std::collections::BTreeSet;
use std::fs;

/// Extract all Rust function names that are annotated with `#[qinvokable]`
/// in the given source text.
///
/// The pattern matches:
///   #[qinvokable]          (possibly with whitespace/attributes in between)
///   fn <name>(
fn extract_qinvokable_names(source: &str) -> BTreeSet<String> {
    // Match `#[qinvokable]` followed (possibly across lines / other attrs)
    // by `fn <name>`.  We use `(?s)` (DOTALL) so `.` matches newlines.
    let re = Regex::new(r"(?s)#\[qinvokable\].*?fn\s+([a-z_][a-z0-9_]*)").unwrap();
    re.captures_iter(source)
        .map(|cap| cap[1].to_string())
        .collect()
}

#[test]
fn ffi_and_mod_have_identical_qinvokable_sets() {
    let ffi_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/cxxqt_bridge/ffi.rs"
    );
    let mod_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/cxxqt_bridge/mod.rs"
    );

    let ffi_src = fs::read_to_string(ffi_path)
        .unwrap_or_else(|e| panic!("Failed to read {ffi_path}: {e}"));
    let mod_src = fs::read_to_string(mod_path)
        .unwrap_or_else(|e| panic!("Failed to read {mod_path}: {e}"));

    let ffi_names = extract_qinvokable_names(&ffi_src);
    let mod_names = extract_qinvokable_names(&mod_src);

    // Sanity: both files should declare at least one invokable.
    assert!(
        !ffi_names.is_empty(),
        "ffi.rs contains zero #[qinvokable] declarations — regex may need updating"
    );
    assert!(
        !mod_names.is_empty(),
        "mod.rs contains zero #[qinvokable] declarations — regex may need updating"
    );

    let only_in_ffi: BTreeSet<_> = ffi_names.difference(&mod_names).collect();
    let only_in_mod: BTreeSet<_> = mod_names.difference(&ffi_names).collect();

    let mut failures = Vec::new();

    if !only_in_ffi.is_empty() {
        failures.push(format!(
            "Invokables in ffi.rs but MISSING from mod.rs: {:?}",
            only_in_ffi
        ));
    }
    if !only_in_mod.is_empty() {
        failures.push(format!(
            "Invokables in mod.rs but MISSING from ffi.rs: {:?}",
            only_in_mod
        ));
    }

    assert!(
        failures.is_empty(),
        "Bridge parity failure!\n{}\n\nffi.rs invokables ({count_ffi}): {ffi_names:?}\nmod.rs invokables ({count_mod}): {mod_names:?}",
        failures.join("\n"),
        count_ffi = ffi_names.len(),
        count_mod = mod_names.len(),
    );

    // Informational: print the verified set size
    eprintln!(
        "Bridge parity OK — {} invokables match in both ffi.rs and mod.rs",
        ffi_names.len()
    );
}
