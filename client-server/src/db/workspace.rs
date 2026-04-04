//! Workspace read queries for degraded-mode `memory_workspace` handling.

use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn list_workspaces(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, parent_workspace_id, registered_at, updated_at
         FROM workspaces
         ORDER BY registered_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id":                  row.get::<_, String>(0)?,
            "path":                row.get::<_, String>(1)?,
            "name":                row.get::<_, String>(2)?,
            "parent_workspace_id": row.get::<_, Option<String>>(3)?,
            "registered_at":       row.get::<_, String>(4)?,
            "updated_at":          row.get::<_, String>(5)?,
        }))
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn get_workspace(conn: &Connection, workspace_id: &str) -> Result<Option<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, parent_workspace_id, profile, meta, registered_at, updated_at
         FROM workspaces
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([workspace_id], |row| {
        Ok(json!({
            "id":                  row.get::<_, String>(0)?,
            "path":                row.get::<_, String>(1)?,
            "name":                row.get::<_, String>(2)?,
            "parent_workspace_id": row.get::<_, Option<String>>(3)?,
            "profile":             row.get::<_, Option<String>>(4)?,
            "meta":                row.get::<_, Option<String>>(5)?,
            "registered_at":       row.get::<_, String>(6)?,
            "updated_at":          row.get::<_, String>(7)?,
        }))
    })?;
    Ok(rows.next().transpose()?)
}

pub fn get_workspace_by_path(conn: &Connection, path: &str) -> Result<Option<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, parent_workspace_id, registered_at, updated_at
         FROM workspaces
         WHERE path = ?1",
    )?;
    let mut rows = stmt.query_map([path], |row| {
        Ok(json!({
            "id":                  row.get::<_, String>(0)?,
            "path":                row.get::<_, String>(1)?,
            "name":                row.get::<_, String>(2)?,
            "parent_workspace_id": row.get::<_, Option<String>>(3)?,
            "registered_at":       row.get::<_, String>(4)?,
            "updated_at":          row.get::<_, String>(5)?,
        }))
    })?;
    Ok(rows.next().transpose()?)
}
