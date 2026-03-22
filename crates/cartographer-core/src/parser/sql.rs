use crate::output::SymbolRecord;
use crate::scanner::lang::ScanMode;
use regex::Regex;

pub fn parse(source: &str, mode: &ScanMode) -> Vec<SymbolRecord> {
    if *mode == ScanMode::Summary {
        return vec![];
    }

    let patterns: &[(&str, &str)] = &[
        (r#"(?i)create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?"#, "table"),
        (r#"(?i)create\s+(?:or\s+replace\s+)?view\s+"?(\w+)"?"#, "view"),
        (r#"(?i)create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?"#, "index"),
        (r#"(?i)create\s+trigger\s+"?(\w+)"?"#, "trigger"),
        (r#"(?i)create\s+(?:or\s+replace\s+)?procedure\s+"?(\w+)"?"#, "procedure"),
    ];

    let mut symbols = Vec::new();

    for (line_num, line) in source.lines().enumerate() {
        for (pattern, kind) in patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(caps) = re.captures(line) {
                    if let Some(name_match) = caps.get(1) {
                        symbols.push(SymbolRecord {
                            name: name_match.as_str().to_string(),
                            kind: kind.to_string(),
                            line_start: line_num as u32,
                            line_end: line_num as u32,
                            qualified_name: None,
                            exported: Some(true),
                            async_fn: None,
                            params: None,
                            return_type: None,
                            docstring: None,
                            body_fragment: None,
                        });
                    }
                }
            }
        }
    }

    symbols
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::lang::ScanMode;

    #[test]
    fn test_parse_sql_table() {
        let source = "CREATE TABLE users (id INTEGER PRIMARY KEY);";
        let symbols = parse(source, &ScanMode::FileContext);
        let tbl = symbols.iter().find(|s| s.kind == "table");
        assert!(tbl.is_some(), "should find a table");
        assert_eq!(tbl.unwrap().name, "users");
    }

    #[test]
    fn test_summary_mode_empty() {
        let source = "CREATE TABLE foo (id INT);";
        assert!(parse(source, &ScanMode::Summary).is_empty());
    }
}
