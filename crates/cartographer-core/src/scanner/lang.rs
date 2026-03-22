use std::path::Path;
use std::str::FromStr;

#[derive(Debug, Clone, PartialEq)]
pub enum Language {
    TypeScript,
    JavaScript,
    Python,
    Rust,
    Sql,
    Unknown,
}

impl Language {
    pub fn as_str(&self) -> &'static str {
        match self {
            Language::TypeScript => "typescript",
            Language::JavaScript => "javascript",
            Language::Python => "python",
            Language::Rust => "rust",
            Language::Sql => "sql",
            Language::Unknown => "unknown",
        }
    }
}

pub fn detect_language(path: &Path) -> Language {
    match path.extension().and_then(|e| e.to_str()) {
        Some("ts") | Some("tsx") => Language::TypeScript,
        Some("js") | Some("jsx") | Some("mjs") | Some("cjs") => Language::JavaScript,
        Some("py") | Some("pyw") => Language::Python,
        Some("rs") => Language::Rust,
        Some("sql") => Language::Sql,
        _ => Language::Unknown,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ScanMode {
    Summary,
    FileContext,
    Full,
}

impl FromStr for ScanMode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "summary" => Ok(ScanMode::Summary),
            "file_context" => Ok(ScanMode::FileContext),
            "full" => Ok(ScanMode::Full),
            other => Err(format!("Unknown scan mode: {}", other)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_language_detection() {
        assert_eq!(detect_language(Path::new("foo.ts")), Language::TypeScript);
        assert_eq!(detect_language(Path::new("foo.tsx")), Language::TypeScript);
        assert_eq!(detect_language(Path::new("foo.js")), Language::JavaScript);
        assert_eq!(detect_language(Path::new("foo.py")), Language::Python);
        assert_eq!(detect_language(Path::new("foo.rs")), Language::Rust);
        assert_eq!(detect_language(Path::new("foo.sql")), Language::Sql);
        assert_eq!(detect_language(Path::new("foo.txt")), Language::Unknown);
    }

    #[test]
    fn test_scan_mode_parse() {
        assert_eq!("summary".parse::<ScanMode>().unwrap(), ScanMode::Summary);
        assert_eq!("file_context".parse::<ScanMode>().unwrap(), ScanMode::FileContext);
        assert_eq!("full".parse::<ScanMode>().unwrap(), ScanMode::Full);
        assert!("bad".parse::<ScanMode>().is_err());
    }
}
