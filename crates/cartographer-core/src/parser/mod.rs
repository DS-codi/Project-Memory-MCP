pub mod python;
pub mod rust_lang;
pub mod sql;
pub mod typescript;

use crate::output::SymbolRecord;
use crate::scanner::lang::{Language, ScanMode};
use std::path::Path;

pub fn parse_file(path: &Path, source: &str, language: &Language, mode: &ScanMode) -> Vec<SymbolRecord> {
    let _ = path;
    match language {
        Language::TypeScript | Language::JavaScript => typescript::parse(source, mode),
        Language::Rust => rust_lang::parse(source, mode),
        Language::Python => python::parse(source, mode),
        Language::Sql => sql::parse(source, mode),
        Language::Unknown => vec![],
    }
}
