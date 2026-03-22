use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolRecord {
    pub name: String,
    pub kind: String,
    pub line_start: u32,
    pub line_end: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qualified_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub async_fn: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docstring: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_fragment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    pub path: String,
    pub language: String,
    pub size_bytes: u64,
    pub symbols: Vec<SymbolRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsBlock {
    pub elapsed_seconds: f64,
    pub file_count: usize,
    pub symbol_count: usize,
    pub budget_hit: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub root: String,
    pub scan_mode: String,
    pub files: Vec<FileResult>,
    pub diagnostics: DiagnosticsBlock,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<ScanResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_response_serialization() {
        let resp = ScanResponse {
            ok: true,
            result: Some(ScanResult {
                root: "/tmp".to_string(),
                scan_mode: "summary".to_string(),
                files: vec![],
                diagnostics: DiagnosticsBlock {
                    elapsed_seconds: 0.1,
                    file_count: 0,
                    symbol_count: 0,
                    budget_hit: false,
                    errors: vec![],
                },
            }),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"ok\":true"));
        assert!(!json.contains("\"error\""));
        let back: ScanResponse = serde_json::from_str(&json).unwrap();
        assert!(back.ok);
        assert!(back.error.is_none());
    }
}
