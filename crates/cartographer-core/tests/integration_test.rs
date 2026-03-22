use std::process::{Command, Stdio};
use std::io::Write;
use std::path::Path;
use serde_json::Value;

fn binary_path() -> std::path::PathBuf {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    // In a workspace, the target dir lives 2 levels up (workspace root)
    let workspace_root = manifest_dir.ancestors().nth(2).unwrap_or(manifest_dir);
    let exe_suffix = std::env::consts::EXE_SUFFIX;
    let release = workspace_root.join(format!("target/release/cartographer-core{}", exe_suffix));
    let debug_path = workspace_root.join(format!("target/debug/cartographer-core{}", exe_suffix));
    if release.exists() {
        release
    } else {
        debug_path
    }
}

fn run_scan(root: &str, scan_mode: &str) -> Value {
    let bin = binary_path();
    if !bin.exists() {
        panic!("Binary not found at {:?}. Run cargo build first.", bin);
    }

    let input = serde_json::json!({
        "action": "scan",
        "root": root,
        "scan_mode": scan_mode,
        "max_files": 100,
        "max_seconds": 10.0
    });

    let mut child = Command::new(&bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to spawn binary");

    {
        let stdin = child.stdin.as_mut().unwrap();
        stdin.write_all(input.to_string().as_bytes()).unwrap();
        stdin.write_all(b"\n").unwrap();
    }

    let output = child.wait_with_output().expect("Failed to wait for binary");
    let stdout = String::from_utf8(output.stdout).unwrap();
    serde_json::from_str(stdout.trim()).expect("Invalid JSON from binary")
}

#[test]
fn test_schema_contract_ok_and_required_fields() {
    let root = env!("CARGO_MANIFEST_DIR");
    let result = run_scan(root, "summary");
    assert_eq!(result["ok"], true, "ok must be true");
    assert!(result["result"].is_object(), "result must be object");
    assert!(result["result"]["files"].is_array(), "files must be array");
    assert!(result["result"]["diagnostics"].is_object(), "diagnostics must be object");
    assert!(result["result"]["diagnostics"]["elapsed_seconds"].is_f64());
    assert!(result["result"]["diagnostics"]["file_count"].is_number());
}

#[test]
fn test_summary_mode_symbols_empty() {
    let root = env!("CARGO_MANIFEST_DIR");
    let result = run_scan(root, "summary");
    let files = result["result"]["files"].as_array().unwrap();
    for file in files {
        let symbols = file["symbols"].as_array().unwrap();
        assert!(symbols.is_empty(), "summary mode symbols must be empty for file {:?}", file["path"]);
    }
}

#[test]
fn test_node_modules_excluded() {
    use std::fs;
    let tmp = std::env::temp_dir().join("cart_integ_test");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(tmp.join("node_modules")).unwrap();
    fs::write(tmp.join("node_modules").join("should_not_appear.ts"), "const x = 1;").unwrap();
    fs::write(tmp.join("index.ts"), "const y = 2;").unwrap();

    let result = run_scan(&tmp.to_string_lossy(), "file_context");
    let files = result["result"]["files"].as_array().unwrap();
    let paths: Vec<String> = files.iter()
        .map(|f| f["path"].as_str().unwrap_or("").to_string())
        .collect();

    for path in &paths {
        assert!(!path.contains("node_modules"), "node_modules should be excluded, found: {}", path);
    }
    assert!(paths.iter().any(|p| p.contains("index.ts")), "index.ts should be present");

    let _ = fs::remove_dir_all(&tmp);
}
