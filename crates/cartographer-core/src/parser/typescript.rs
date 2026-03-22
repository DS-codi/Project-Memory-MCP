use crate::output::SymbolRecord;
use crate::scanner::lang::ScanMode;
use tree_sitter::Parser;

pub fn parse(source: &str, mode: &ScanMode) -> Vec<SymbolRecord> {
    if *mode == ScanMode::Summary {
        return vec![];
    }

    let mut parser = Parser::new();
    let language = tree_sitter_typescript::language_typescript();
    parser.set_language(&language).expect("Error loading TypeScript grammar");

    let tree = match parser.parse(source, None) {
        Some(t) => t,
        None => return vec![],
    };

    let source_bytes = source.as_bytes();
    let lines: Vec<&str> = source.lines().collect();
    let mut symbols = Vec::new();

    fn node_name(node: &tree_sitter::Node<'_>, source: &[u8]) -> Option<String> {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "identifier"
                || child.kind() == "property_identifier"
                || child.kind() == "shorthand_property_identifier_pattern"
                || child.kind() == "type_identifier"
            {
                return child.utf8_text(source).ok().map(|s| s.to_string());
            }
        }
        None
    }

    fn visit_node(
        node: &tree_sitter::Node<'_>,
        source_bytes: &[u8],
        lines: &[&str],
        mode: &ScanMode,
        symbols: &mut Vec<SymbolRecord>,
        depth: usize,
    ) {
        if depth > 8 {
            return;
        }
        let kind = node.kind();
        let symbol_kind = match kind {
            "function_declaration" | "function" => Some("function"),
            "arrow_function" => Some("arrow_function"),
            "class_declaration" | "class" => Some("class"),
            "interface_declaration" => Some("interface"),
            "type_alias_declaration" => Some("type_alias"),
            "enum_declaration" => Some("enum"),
            "method_definition" => Some("method"),
            "public_field_definition" => Some("property"),
            "variable_declarator" => Some("variable"),
            "import_statement" => Some("import"),
            "export_statement" => Some("export"),
            _ => None,
        };

        if let Some(sk) = symbol_kind {
            let name = node_name(node, source_bytes).unwrap_or_else(|| "<anonymous>".to_string());
            let line_start = node.start_position().row as u32;
            let line_end = node.end_position().row as u32;

            let body_fragment = if *mode == ScanMode::Full {
                let start = line_start as usize;
                let end = std::cmp::min(start + 5, lines.len());
                if start < lines.len() {
                    Some(lines[start..end].join("\n"))
                } else {
                    None
                }
            } else {
                None
            };

            symbols.push(SymbolRecord {
                name,
                kind: sk.to_string(),
                line_start,
                line_end,
                qualified_name: None,
                exported: None,
                async_fn: None,
                params: None,
                return_type: None,
                docstring: None,
                body_fragment,
            });
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            visit_node(&child, source_bytes, lines, mode, symbols, depth + 1);
        }
    }

    visit_node(&tree.root_node(), source_bytes, &lines, mode, &mut symbols, 0);
    symbols
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::lang::ScanMode;

    #[test]
    fn test_parse_ts_function_and_class() {
        let source = r#"
function hello(name: string): void {
    console.log(name);
}

class Greeter {
    greet() { return "hi"; }
}
"#;
        let symbols = parse(source, &ScanMode::FileContext);
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"hello"), "should find function 'hello'");
        assert!(names.contains(&"Greeter"), "should find class 'Greeter'");
    }

    #[test]
    fn test_summary_mode_empty() {
        let source = "function foo() {}";
        let symbols = parse(source, &ScanMode::Summary);
        assert!(symbols.is_empty());
    }

    #[test]
    fn test_full_mode_body_fragment() {
        let source = "function foo() {\n    return 1;\n}\n";
        let symbols = parse(source, &ScanMode::Full);
        let func = symbols.iter().find(|s| s.name == "foo");
        if let Some(f) = func {
            assert!(f.body_fragment.is_some());
        }
    }
}
