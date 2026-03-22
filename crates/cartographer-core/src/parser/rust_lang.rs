use crate::output::SymbolRecord;
use crate::scanner::lang::ScanMode;
use tree_sitter::Parser;

pub fn parse(source: &str, mode: &ScanMode) -> Vec<SymbolRecord> {
    if *mode == ScanMode::Summary {
        return vec![];
    }

    let mut parser = Parser::new();
    let language = tree_sitter_rust::language();
    parser.set_language(&language).expect("Error loading Rust grammar");

    let tree = match parser.parse(source, None) {
        Some(t) => t,
        None => return vec![],
    };

    let source_bytes = source.as_bytes();
    let lines: Vec<&str> = source.lines().collect();
    let mut symbols = Vec::new();

    fn visit(
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
            "function_item" => Some("function"),
            "struct_item" => Some("struct"),
            "enum_item" => Some("enum"),
            "trait_item" => Some("trait"),
            "impl_item" => Some("impl"),
            "type_item" => Some("type_alias"),
            "const_item" => Some("const"),
            "static_item" => Some("static"),
            "macro_definition" | "macro_invocation" => Some("macro"),
            "mod_item" => Some("module"),
            _ => None,
        };

        if let Some(sk) = symbol_kind {
            let name = {
                let mut cursor = node.walk();
                let mut n = None;
                for child in node.children(&mut cursor) {
                    if child.kind() == "identifier" || child.kind() == "type_identifier" {
                        n = child.utf8_text(source_bytes).ok().map(|s| s.to_string());
                        break;
                    }
                }
                n.unwrap_or_else(|| "<anonymous>".to_string())
            };

            let line_start = node.start_position().row as u32;
            let line_end = node.end_position().row as u32;

            let exported = {
                let mut cursor = node.walk();
                let has_pub = node.children(&mut cursor).any(|c| c.kind() == "visibility_modifier");
                Some(has_pub)
            };

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
                exported,
                async_fn: None,
                params: None,
                return_type: None,
                docstring: None,
                body_fragment,
            });
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            visit(&child, source_bytes, lines, mode, symbols, depth + 1);
        }
    }

    visit(&tree.root_node(), source_bytes, &lines, mode, &mut symbols, 0);
    symbols
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::lang::ScanMode;

    #[test]
    fn test_parse_rust_function() {
        let source = "pub fn hello() -> String { String::new() }";
        let symbols = parse(source, &ScanMode::FileContext);
        let func = symbols.iter().find(|s| s.kind == "function");
        assert!(func.is_some(), "should find a function");
        assert_eq!(func.unwrap().name, "hello");
        assert_eq!(func.unwrap().exported, Some(true));
    }

    #[test]
    fn test_summary_mode_empty() {
        let source = "pub fn hello() {}";
        assert!(parse(source, &ScanMode::Summary).is_empty());
    }
}
