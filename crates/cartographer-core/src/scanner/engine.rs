use crate::output::{DiagnosticsBlock, FileResult, ScanResult};
use crate::parser::parse_file;
use crate::scanner::lang::{detect_language, Language, ScanMode};
use crate::scanner::walker::walk;
use rayon::prelude::*;
use std::path::Path;
use std::time::Instant;

pub fn scan(
    root: &Path,
    mode: ScanMode,
    max_files: usize,
    max_seconds: f64,
    include_extensions: Option<Vec<String>>,
    extra_excludes: Option<Vec<String>>,
) -> ScanResult {
    let started = Instant::now();

    let all_files = walk(
        root,
        include_extensions.as_deref(),
        extra_excludes.as_deref(),
    );

    let files_to_scan: Vec<_> = all_files.into_iter().take(max_files).collect();
    let budget_hit = files_to_scan.len() == max_files;

    let file_results: Vec<FileResult> = files_to_scan
        .par_iter()
        .filter_map(|path| {
            if started.elapsed().as_secs_f64() > max_seconds {
                return None;
            }

            let lang = detect_language(path);
            if lang == Language::Unknown {
                return None;
            }

            let source = match std::fs::read_to_string(path) {
                Ok(s) => s,
                Err(_) => return None,
            };

            let size_bytes = source.len() as u64;
            let symbols = parse_file(path, &source, &lang, &mode);

            Some(FileResult {
                path: path.to_string_lossy().to_string(),
                language: lang.as_str().to_string(),
                size_bytes,
                symbols,
            })
        })
        .collect();

    let symbol_count: usize = file_results.iter().map(|f| f.symbols.len()).sum();
    let elapsed_seconds = started.elapsed().as_secs_f64();

    ScanResult {
        root: root.to_string_lossy().to_string(),
        scan_mode: match mode {
            ScanMode::Summary => "summary".to_string(),
            ScanMode::FileContext => "file_context".to_string(),
            ScanMode::Full => "full".to_string(),
        },
        files: file_results,
        diagnostics: DiagnosticsBlock {
            elapsed_seconds,
            file_count: files_to_scan.len(),
            symbol_count,
            budget_hit,
            errors: vec![],
        },
    }
}
