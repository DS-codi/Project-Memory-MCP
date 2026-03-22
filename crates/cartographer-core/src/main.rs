use cartographer_core::output::ScanResponse;
use cartographer_core::scanner::engine::scan;
use cartographer_core::scanner::lang::ScanMode;
use serde::Deserialize;
use std::io::{self, BufRead};
use std::path::Path;
use std::str::FromStr;

#[derive(Deserialize)]
struct ScanRequest {
    pub action: String,
    pub root: String,
    pub scan_mode: Option<String>,
    pub max_files: Option<usize>,
    pub max_seconds: Option<f64>,
    pub include_extensions: Option<Vec<String>>,
    pub exclude_paths: Option<Vec<String>>,
}

fn main() {
    let stdin = io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line).expect("Failed to read stdin");

    let line = line.trim();
    if line.is_empty() {
        let resp = ScanResponse { ok: false, result: None, error: Some("Empty input".to_string()) };
        println!("{}", serde_json::to_string(&resp).unwrap());
        return;
    }

    let req: ScanRequest = match serde_json::from_str(line) {
        Ok(r) => r,
        Err(e) => {
            let resp = ScanResponse { ok: false, result: None, error: Some(format!("Parse error: {}", e)) };
            println!("{}", serde_json::to_string(&resp).unwrap());
            return;
        }
    };

    if req.action != "scan" {
        let resp = ScanResponse { ok: false, result: None, error: Some(format!("Unknown action: {}", req.action)) };
        println!("{}", serde_json::to_string(&resp).unwrap());
        return;
    }

    let mode = req.scan_mode
        .as_deref()
        .and_then(|m| ScanMode::from_str(m).ok())
        .unwrap_or(ScanMode::Summary);

    let max_files = req.max_files.unwrap_or(5000);
    let max_seconds = req.max_seconds.unwrap_or(30.0);

    let root = Path::new(&req.root);
    if !root.exists() {
        let resp = ScanResponse { ok: false, result: None, error: Some(format!("Root path not found: {}", req.root)) };
        println!("{}", serde_json::to_string(&resp).unwrap());
        return;
    }

    let result = scan(root, mode, max_files, max_seconds, req.include_extensions, req.exclude_paths);

    let resp = ScanResponse {
        ok: true,
        result: Some(result),
        error: None,
    };

    println!("{}", serde_json::to_string(&resp).unwrap());
}
