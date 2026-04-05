// code_index.rs — Persistent per-component source index with changelog diffing.
//
// Workflow:
//   1. load(component, root)    — load prior snapshot (may be None on first run)
//   2. snapshot(component, root) — walk source dirs, extract symbols + line counts
//   3. diff(old, new)           — produce ChangeLog
//   4. save(component, new, root) — persist new snapshot to .pm-build-index/
//
// Supported languages: Rust (.rs), TypeScript/TSX/JS (.ts/.tsx/.js/.jsx),
//                      QML (.qml), Python (.py)

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

// ─── Symbol kinds ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    PubFn,
    Fn,
    Struct,
    Enum,
    Trait,
    Impl,
    Const,
    Type,
    Interface,
    Class,
    Export,
}

impl SymbolKind {
    pub fn label(&self) -> &'static str {
        match self {
            SymbolKind::PubFn     => "pub fn",
            SymbolKind::Fn        => "fn",
            SymbolKind::Struct    => "struct",
            SymbolKind::Enum      => "enum",
            SymbolKind::Trait     => "trait",
            SymbolKind::Impl      => "impl",
            SymbolKind::Const     => "const",
            SymbolKind::Type      => "type",
            SymbolKind::Interface => "interface",
            SymbolKind::Class     => "class",
            SymbolKind::Export    => "export",
        }
    }
}

// ─── Index types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolEntry {
    pub name: String,
    pub kind: SymbolKind,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub line_count: usize,
    pub symbols: Vec<SymbolEntry>,
}

/// Relative path (forward-slash) → file entry
pub type ComponentIndex = HashMap<String, FileEntry>;

// ─── ChangeLog ────────────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct ChangeLog {
    pub added_files:    Vec<String>,
    pub removed_files:  Vec<String>,
    /// (path, line_delta)
    pub modified_files: Vec<(String, i64)>,
    /// (path, symbol_name, kind)
    pub added_symbols:  Vec<(String, String, SymbolKind)>,
    pub removed_symbols: Vec<(String, String, SymbolKind)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LineKind {
    Header,
    Added,
    Removed,
    Modified,
    Neutral,
}

impl ChangeLog {
    pub fn is_empty(&self) -> bool {
        self.added_files.is_empty()
            && self.removed_files.is_empty()
            && self.modified_files.is_empty()
            && self.added_symbols.is_empty()
            && self.removed_symbols.is_empty()
    }

    pub fn to_text(&self, component: &str) -> String {
        if self.is_empty() {
            return format!("=== CHANGELOG: {} ===\n  (no changes since last build)\n\n", component);
        }
        let mut out = format!("=== CHANGELOG: {} ===\n", component);
        for f in &self.added_files {
            out.push_str(&format!("  +FILE  {}\n", f));
        }
        for f in &self.removed_files {
            out.push_str(&format!("  -FILE  {}\n", f));
        }
        for (f, delta) in &self.modified_files {
            let sign = if *delta >= 0 { "+" } else { "" };
            out.push_str(&format!("  ~FILE  {}  ({}{} lines)\n", f, sign, delta));
        }
        for (path, name, kind) in &self.added_symbols {
            out.push_str(&format!("  +{}  {}  ({})\n", kind.label(), name, path));
        }
        for (path, name, kind) in &self.removed_symbols {
            out.push_str(&format!("  -{}  {}  ({})\n", kind.label(), name, path));
        }
        out.push('\n');
        out
    }

    pub fn to_lines(&self, component: &str) -> Vec<(String, LineKind)> {
        let mut lines = Vec::new();
        lines.push((format!("── CHANGELOG: {} ──", component), LineKind::Header));
        if self.is_empty() {
            lines.push(("  (no changes since last build)".to_string(), LineKind::Neutral));
            return lines;
        }
        for f in &self.added_files {
            lines.push((format!("  + FILE  {}", f), LineKind::Added));
        }
        for f in &self.removed_files {
            lines.push((format!("  - FILE  {}", f), LineKind::Removed));
        }
        for (f, delta) in &self.modified_files {
            let sign = if *delta >= 0 { "+" } else { "" };
            lines.push((format!("  ~ FILE  {}  ({}{} lines)", f, sign, delta), LineKind::Modified));
        }
        for (path, name, kind) in &self.added_symbols {
            lines.push((format!("  + {}  {}  ({})", kind.label(), name, path), LineKind::Added));
        }
        for (path, name, kind) in &self.removed_symbols {
            lines.push((format!("  - {}  {}  ({})", kind.label(), name, path), LineKind::Removed));
        }
        lines
    }
}

// ─── Diagnostic context extraction ───────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum DiagKind {
    Warning,
    Error,
}

#[derive(Debug, Clone)]
pub struct DiagBlock {
    pub section: String,
    pub kind: DiagKind,
    pub lines: Vec<String>,
}

/// Parse `build_warnings.log` into diagnostic blocks (each warning/error with context).
pub fn extract_diagnostics(log: &str) -> Vec<DiagBlock> {
    let mut blocks: Vec<DiagBlock> = Vec::new();
    let mut section = String::new();
    let mut cur: Option<(DiagKind, Vec<String>)> = None;

    for raw in log.lines() {
        let tl = raw.trim().to_lowercase();

        // Section separator from run_build_phase
        if raw.starts_with("=== ") && raw.trim_end().ends_with("===") {
            if let Some((kind, lines)) = cur.take() {
                if !lines.is_empty() {
                    blocks.push(DiagBlock { section: section.clone(), kind, lines });
                }
            }
            section = raw
                .trim_start_matches('=')
                .trim_end_matches('=')
                .trim()
                .to_string();
            continue;
        }

        let is_err  = (tl.starts_with("error:")  || tl.starts_with("error["))
                      || tl.contains("): error ts");
        let is_warn = (tl.starts_with("warning:") || tl.starts_with("warning["))
                      || tl.contains("): warning ts");
        let is_fp   = tl.contains("no warning")
                      || tl.contains("0 warning")
                      || tl.contains("no error");

        if (is_err || is_warn) && !is_fp {
            // Flush previous block
            if let Some((kind, lines)) = cur.take() {
                if !lines.is_empty() {
                    blocks.push(DiagBlock { section: section.clone(), kind, lines });
                }
            }
            let kind = if is_err { DiagKind::Error } else { DiagKind::Warning };
            cur = Some((kind, vec![raw.to_string()]));
        } else if let Some((_, ref mut lines)) = cur {
            lines.push(raw.to_string());
        }
    }

    if let Some((kind, lines)) = cur.take() {
        if !lines.is_empty() {
            blocks.push(DiagBlock { section, kind, lines });
        }
    }

    blocks
}

/// Render diagnostic blocks into (text, LineKind) pairs for the TUI.
pub fn diag_to_lines(blocks: &[DiagBlock]) -> Vec<(String, LineKind)> {
    let mut out: Vec<(String, LineKind)> = Vec::new();
    let mut last_section = String::new();
    for b in blocks {
        if b.section != last_section {
            if !last_section.is_empty() {
                out.push(("".to_string(), LineKind::Neutral));
            }
            out.push((format!("── {} ──", b.section), LineKind::Header));
            last_section = b.section.clone();
        }
        let top_kind = if b.kind == DiagKind::Error { LineKind::Removed } else { LineKind::Modified };
        for (i, l) in b.lines.iter().enumerate() {
            out.push((l.clone(), if i == 0 { top_kind.clone() } else { LineKind::Neutral }));
        }
        out.push(("".to_string(), LineKind::Neutral));
    }
    out
}

/// Build the full structured clipboard/save report.
pub fn build_report(
    changelogs: &[(String, ChangeLog)],
    warning_log: &str,
) -> String {
    let mut out = String::from("=== BUILD REPORT ===\n\n");

    out.push_str("─── CHANGELOG ─────────────────────────────────────────────\n");
    for (comp, cl) in changelogs {
        out.push_str(&cl.to_text(comp));
    }

    let blocks = extract_diagnostics(warning_log);
    let errors: Vec<&DiagBlock>   = blocks.iter().filter(|b| b.kind == DiagKind::Error).collect();
    let warnings: Vec<&DiagBlock> = blocks.iter().filter(|b| b.kind == DiagKind::Warning).collect();

    if !errors.is_empty() {
        out.push_str("─── ERRORS ─────────────────────────────────────────────────\n");
        let mut last_sec = String::new();
        for b in &errors {
            if b.section != last_sec {
                out.push_str(&format!("\n=== {} ===\n", b.section));
                last_sec = b.section.clone();
            }
            for l in &b.lines { out.push_str(l); out.push('\n'); }
            out.push('\n');
        }
    }

    if !warnings.is_empty() {
        out.push_str("─── WARNINGS ───────────────────────────────────────────────\n");
        let mut last_sec = String::new();
        for b in &warnings {
            if b.section != last_sec {
                out.push_str(&format!("\n=== {} ===\n", b.section));
                last_sec = b.section.clone();
            }
            for l in &b.lines { out.push_str(l); out.push('\n'); }
            out.push('\n');
        }
    }

    out
}

// ─── Source directory map ─────────────────────────────────────────────────────

pub fn source_dirs(component: &str) -> Vec<&'static str> {
    match component {
        "Supervisor"              => vec!["supervisor/src", "supervisor/qml"],
        "SupervisorIced"          => vec!["supervisor-iced/src"],
        "GuiForms"                => vec!["pm-gui-forms/src"],
        "BrainstormGui"           => vec!["pm-brainstorm-gui/src", "pm-brainstorm-gui/qml"],
        "ApprovalGui"             => vec!["pm-approval-gui/src", "pm-approval-gui/qml"],
        "InteractiveTerminal"     => vec!["interactive-terminal/src", "interactive-terminal/qml"],
        "InteractiveTerminalIced" => vec!["interactive-terminal-iced/src"],
        "Server"                  => vec!["server/src"],
        "Dashboard"               => vec!["dashboard/src", "dashboard/server/src"],
        "DashboardSolid"          => vec!["dashboard-solid/src"],
        "Extension"               => vec!["vscode-extension/src"],
        "Cartographer"            => vec!["python-core"],
        "ClientProxy"             => vec!["client-server/src"],
        _                         => vec![],
    }
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

pub fn snapshot(component: &str, root: &Path) -> ComponentIndex {
    let mut index = ComponentIndex::new();
    for rel_dir in source_dirs(component) {
        let dir = root.join(rel_dir);
        if dir.exists() {
            walk_dir(&dir, rel_dir, &mut index);
        }
    }
    index
}

fn walk_dir(dir: &Path, prefix: &str, index: &mut ComponentIndex) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden dirs and target/node_modules
        if name.starts_with('.') || name == "target" || name == "node_modules" {
            continue;
        }
        if path.is_dir() {
            let sub = format!("{}/{}", prefix, name);
            walk_dir(&path, &sub, index);
        } else if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(ext, "rs" | "ts" | "tsx" | "js" | "jsx" | "qml" | "py") {
                let rel = format!("{}/{}", prefix, name);
                if let Some(fe) = index_file(&path) {
                    index.insert(rel, fe);
                }
            }
        }
    }
}

pub fn index_file(path: &Path) -> Option<FileEntry> {
    let content = std::fs::read_to_string(path).ok()?;
    let line_count = content.lines().count();
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let symbols = match ext {
        "rs"                       => extract_rs(&content),
        "ts" | "tsx" | "js" | "jsx" => extract_ts(&content),
        "qml"                      => extract_qml(&content),
        "py"                       => extract_py(&content),
        _                          => Vec::new(),
    };
    Some(FileEntry { line_count, symbols })
}

// ─── Symbol extractors ────────────────────────────────────────────────────────

fn extract_rs(src: &str) -> Vec<SymbolEntry> {
    let mut out = Vec::new();
    for (i, raw) in src.lines().enumerate() {
        let t = raw.trim();
        let ln = i + 1;
        if t.starts_with("//") { continue; }

        macro_rules! strip {
            ($t:expr, $($prefix:expr),+) => { None $(.or_else(|| $t.strip_prefix($prefix)))+ }
        }

        if let Some(r) = strip!(t, "pub async fn ", "pub fn ") {
            let name = r.split('(').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::PubFn, ln)); continue; }
        }
        if let Some(r) = strip!(t, "async fn ", "fn ") {
            let name = r.split('(').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Fn, ln)); continue; }
        }
        if let Some(r) = strip!(t, "pub struct ", "pub(crate) struct ", "struct ") {
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Struct, ln)); continue; }
        }
        if let Some(r) = strip!(t, "pub enum ", "pub(crate) enum ", "enum ") {
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Enum, ln)); continue; }
        }
        if let Some(r) = strip!(t, "pub trait ", "pub(crate) trait ", "trait ") {
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Trait, ln)); continue; }
        }
        if t.starts_with("impl ") {
            let rest = &t[5..];
            let name = if let Some(pos) = rest.find(" for ") {
                ident_head(&rest[pos + 5..])
            } else {
                ident_head(rest)
            };
            if !name.is_empty() { out.push(sym(name, SymbolKind::Impl, ln)); continue; }
        }
        if let Some(r) = strip!(t, "pub const ", "const ") {
            let name = r.split(':').next().unwrap_or("").trim().to_string();
            if is_ident(&name) { out.push(sym(name, SymbolKind::Const, ln)); continue; }
        }
        if let Some(r) = strip!(t, "pub type ", "type ") {
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Type, ln)); continue; }
        }
    }
    out
}

fn extract_ts(src: &str) -> Vec<SymbolEntry> {
    let mut out = Vec::new();
    for (i, raw) in src.lines().enumerate() {
        let t = raw.trim();
        let ln = i + 1;
        if t.starts_with("//") { continue; }

        if t.starts_with("export async function ") || t.starts_with("export function ") {
            let r = t.trim_start_matches("export async function ").trim_start_matches("export function ");
            let name = r.split(|c: char| c == '(' || c == '<').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Export, ln)); continue; }
        }
        if t.starts_with("async function ") || t.starts_with("function ") {
            let r = t.trim_start_matches("async function ").trim_start_matches("function ");
            let name = r.split(|c: char| c == '(' || c == '<').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Fn, ln)); continue; }
        }
        if t.starts_with("export const ") || t.starts_with("export let ") {
            let r = t.trim_start_matches("export let ").trim_start_matches("export const ");
            let name = r.split(|c: char| c == ':' || c == '=' || c.is_whitespace()).next().unwrap_or("").to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Export, ln)); continue; }
        }
        if t.starts_with("export abstract class ") || t.starts_with("export class ") {
            let r = t.trim_start_matches("export abstract class ").trim_start_matches("export class ");
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Class, ln)); continue; }
        }
        if t.starts_with("export interface ") {
            let r = &t["export interface ".len()..];
            let name = ident_head(r);
            if !name.is_empty() { out.push(sym(name, SymbolKind::Interface, ln)); continue; }
        }
        if t.starts_with("export type ") {
            let r = &t["export type ".len()..];
            let name = r.split(|c: char| c == '=' || c == '<' || c.is_whitespace()).next().unwrap_or("").to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Type, ln)); continue; }
        }
    }
    out
}

fn extract_qml(src: &str) -> Vec<SymbolEntry> {
    let mut out = Vec::new();
    for (i, raw) in src.lines().enumerate() {
        let t = raw.trim();
        let ln = i + 1;
        if t.starts_with("//") { continue; }
        if t.starts_with("function ") {
            let r = &t["function ".len()..];
            let name = r.split('(').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Fn, ln)); }
        }
        if t.starts_with("property ") {
            let parts: Vec<&str> = t.split_whitespace().collect();
            if parts.len() >= 3 {
                let name = parts[2].trim_end_matches(':').to_string();
                if is_ident(&name) { out.push(sym(name, SymbolKind::Const, ln)); }
            }
        }
        if t.starts_with("signal ") {
            let r = &t["signal ".len()..];
            let name = r.split('(').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Export, ln)); }
        }
    }
    out
}

fn extract_py(src: &str) -> Vec<SymbolEntry> {
    let mut out = Vec::new();
    for (i, raw) in src.lines().enumerate() {
        let t = raw.trim();
        let ln = i + 1;
        if t.starts_with('#') { continue; }
        if t.starts_with("async def ") || t.starts_with("def ") {
            let r = t.trim_start_matches("async def ").trim_start_matches("def ");
            let name = r.split('(').next().unwrap_or("").trim().to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Fn, ln)); }
        }
        if t.starts_with("class ") {
            let r = &t[6..];
            let name = r.split(|c: char| c == '(' || c == ':' || c.is_whitespace()).next().unwrap_or("").to_string();
            if !name.is_empty() { out.push(sym(name, SymbolKind::Class, ln)); }
        }
    }
    out
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn sym(name: String, kind: SymbolKind, line: usize) -> SymbolEntry {
    SymbolEntry { name, kind, line }
}

fn ident_head(s: &str) -> String {
    s.split(|c: char| c == '{' || c == '(' || c == '<' || c == ';' || c.is_whitespace())
        .next()
        .unwrap_or("")
        .to_string()
}

fn is_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '_')
}

// ─── Persist ──────────────────────────────────────────────────────────────────

fn index_dir(root: &Path) -> PathBuf {
    root.join(".pm-build-index")
}

pub fn load(component: &str, root: &Path) -> Option<ComponentIndex> {
    let path = index_dir(root).join(format!("{}.json", component));
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn save(component: &str, index: &ComponentIndex, root: &Path) {
    let dir = index_dir(root);
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(format!("{}.json", component));
    if let Ok(json) = serde_json::to_string_pretty(index) {
        let _ = std::fs::write(path, json);
    }
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

pub fn diff(old: &ComponentIndex, new: &ComponentIndex) -> ChangeLog {
    let mut cl = ChangeLog::default();

    for key in new.keys() {
        if !old.contains_key(key) {
            cl.added_files.push(key.clone());
        }
    }
    for key in old.keys() {
        if !new.contains_key(key) {
            cl.removed_files.push(key.clone());
        }
    }

    for (key, new_fe) in new {
        if let Some(old_fe) = old.get(key) {
            let old_names: HashSet<&str> = old_fe.symbols.iter().map(|s| s.name.as_str()).collect();
            let new_names: HashSet<&str> = new_fe.symbols.iter().map(|s| s.name.as_str()).collect();

            for sym in &new_fe.symbols {
                if !old_names.contains(sym.name.as_str()) {
                    cl.added_symbols.push((key.clone(), sym.name.clone(), sym.kind.clone()));
                }
            }
            for sym in &old_fe.symbols {
                if !new_names.contains(sym.name.as_str()) {
                    cl.removed_symbols.push((key.clone(), sym.name.clone(), sym.kind.clone()));
                }
            }

            let delta = new_fe.line_count as i64 - old_fe.line_count as i64;
            if delta != 0 {
                cl.modified_files.push((key.clone(), delta));
            }
        }
    }

    cl.added_files.sort();
    cl.removed_files.sort();
    cl.modified_files.sort_by(|a, b| a.0.cmp(&b.0));
    cl.added_symbols.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    cl.removed_symbols.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    cl
}
