//! Instruction file read queries for degraded-mode `memory_instructions` handling.

use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Value};

fn instruction_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id":         row.get::<_, String>(0)?,
        "filename":   row.get::<_, String>(1)?,
        "applies_to": row.get::<_, String>(2)?,
        "content":    row.get::<_, String>(3)?,
        "created_at": row.get::<_, String>(4)?,
        "updated_at": row.get::<_, String>(5)?,
    }))
}

pub fn list_instructions(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, applies_to, content, created_at, updated_at
         FROM instruction_files ORDER BY filename",
    )?;
    let rows = stmt.query_map([], instruction_row)?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

pub fn get_instruction(conn: &Connection, filename: &str) -> Result<Option<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, applies_to, content, created_at, updated_at
         FROM instruction_files WHERE LOWER(filename) = ?1",
    )?;
    let lower = filename.to_ascii_lowercase();
    let mut rows = stmt.query_map([&lower], instruction_row)?;
    Ok(rows.next().transpose()?)
}

pub fn search_instructions(conn: &Connection, query: &str) -> Result<Vec<Value>> {
    let like = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, filename, applies_to, content, created_at, updated_at
         FROM instruction_files
         WHERE filename LIKE ?1 OR content LIKE ?1 OR applies_to LIKE ?1
         ORDER BY filename",
    )?;
    let rows = stmt.query_map([&like], instruction_row)?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

/// Extract the first ## or ### section whose heading contains `heading` (case-insensitive).
pub fn get_section(conn: &Connection, filename: &str, heading: &str) -> Result<Option<String>> {
    let row = match get_instruction(conn, filename)? {
        Some(r) => r,
        None    => return Ok(None),
    };
    let content = row["content"].as_str().unwrap_or("");
    let lower_heading = heading.to_ascii_lowercase();

    let mut in_section = false;
    let mut section_lines: Vec<&str> = Vec::new();

    for line in content.lines() {
        if let Some(m) = heading_match(line) {
            if in_section {
                break; // reached next heading
            }
            if m.to_ascii_lowercase().contains(&lower_heading) {
                in_section = true;
                section_lines.push(line);
            }
        } else if in_section {
            section_lines.push(line);
        }
    }

    if in_section {
        Ok(Some(section_lines.join("\n").trim().to_string()))
    } else {
        Ok(None)
    }
}

/// If `line` is a level-2 or level-3 markdown heading, return the heading text.
fn heading_match(line: &str) -> Option<&str> {
    let stripped = line.strip_prefix("## ").or_else(|| line.strip_prefix("### "))?;
    Some(stripped.trim())
}

pub fn list_workspace_instructions(conn: &Connection, workspace_id: &str) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.filename, i.applies_to, i.content, i.created_at, i.updated_at
         FROM instruction_files i
         JOIN workspace_instruction_assignments a ON i.filename = a.filename
         WHERE a.workspace_id = ?1
         ORDER BY i.filename",
    )?;
    let rows = stmt.query_map([workspace_id], instruction_row)?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}
