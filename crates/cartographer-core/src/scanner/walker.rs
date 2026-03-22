use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const EXCLUDE_DIRS: &[&str] = &[
    ".git", "node_modules", ".venv", "venv", "env", ".env",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "dist", "build", ".next", ".nuxt", "coverage", ".coverage",
    ".turbo", "tmp", "temp", "logs", ".tox", ".nox",
    "target", ".cargo", ".rustup",
];

const EXCLUDE_FILES: &[&str] = &[
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Cargo.lock", "bun.lockb",
];

pub fn walk(
    root: &Path,
    include_extensions: Option<&[String]>,
    extra_excludes: Option<&[String]>,
) -> Vec<PathBuf> {
    let mut results = Vec::new();

    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let fname = e.file_name().to_string_lossy();
            if e.file_type().is_dir() {
                let excluded = EXCLUDE_DIRS.iter().any(|d| *d == fname.as_ref());
                let extra_excluded = extra_excludes
                    .map(|xs| xs.iter().any(|x| x == fname.as_ref()))
                    .unwrap_or(false);
                !excluded && !extra_excluded
            } else {
                true
            }
        });

    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

        // Skip excluded file names
        if EXCLUDE_FILES.iter().any(|f| *f == fname.as_str()) {
            continue;
        }

        // Apply extension filter if given
        if let Some(exts) = include_extensions {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !exts.iter().any(|e| e.trim_start_matches('.') == ext) {
                continue;
            }
        }

        results.push(path.to_path_buf());
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_excludes_node_modules() {
        let tmp = std::env::temp_dir().join("cart_walker_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("node_modules")).unwrap();
        fs::write(tmp.join("node_modules").join("foo.ts"), "x").unwrap();
        fs::write(tmp.join("index.ts"), "x").unwrap();

        let files = walk(&tmp, None, None);
        assert!(!files.iter().any(|p| p.to_string_lossy().contains("node_modules")));
        assert!(files.iter().any(|p| p.ends_with("index.ts")));

        let _ = fs::remove_dir_all(&tmp);
    }
}
