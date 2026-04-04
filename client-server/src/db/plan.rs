//! Plan + phase read queries for degraded-mode `memory_plan` handling.

use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Value};

/// List plans for a workspace, optionally filtered by status.
pub fn list_plans(conn: &Connection, workspace_id: &str, status: Option<&str>) -> Result<Vec<Value>> {
    let mapper = |row: &rusqlite::Row<'_>| Ok(json!({
        "id":                     row.get::<_, String>(0)?,
        "workspace_id":           row.get::<_, String>(1)?,
        "title":                  row.get::<_, String>(2)?,
        "status":                 row.get::<_, String>(3)?,
        "category":               row.get::<_, Option<String>>(4)?,
        "priority":               row.get::<_, Option<String>>(5)?,
        "goals":                  row.get::<_, Option<String>>(6)?,
        "created_at":             row.get::<_, String>(7)?,
        "updated_at":             row.get::<_, String>(8)?,
        "completed_at":           row.get::<_, Option<String>>(9)?,
        "recommended_next_agent": row.get::<_, Option<String>>(10)?,
    }));

    let mut result = Vec::new();
    if let Some(s) = status {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, title, status, category, priority, goals,
                    created_at, updated_at, completed_at, recommended_next_agent
             FROM plans WHERE workspace_id = ?1 AND status = ?2 ORDER BY created_at DESC",
        )?;
        for row in stmt.query_map([workspace_id, s], mapper)? {
            result.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, title, status, category, priority, goals,
                    created_at, updated_at, completed_at, recommended_next_agent
             FROM plans WHERE workspace_id = ?1 ORDER BY created_at DESC",
        )?;
        for row in stmt.query_map([workspace_id], mapper)? {
            result.push(row?);
        }
    }
    Ok(result)
}

/// Get a single plan with all its phases and steps.
pub fn get_plan(conn: &Connection, plan_id: &str) -> Result<Option<Value>> {
    let plan_row: Option<Value> = {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, program_id, title, description, category, priority,
                    status, goals, success_criteria, recommended_next_agent,
                    created_at, updated_at, completed_at
             FROM plans WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map([plan_id], |row| {
            Ok(json!({
                "id":                     row.get::<_, String>(0)?,
                "workspace_id":           row.get::<_, String>(1)?,
                "program_id":             row.get::<_, Option<String>>(2)?,
                "title":                  row.get::<_, String>(3)?,
                "description":            row.get::<_, Option<String>>(4)?,
                "category":               row.get::<_, Option<String>>(5)?,
                "priority":               row.get::<_, Option<String>>(6)?,
                "status":                 row.get::<_, String>(7)?,
                "goals":                  row.get::<_, Option<String>>(8)?,
                "success_criteria":       row.get::<_, Option<String>>(9)?,
                "recommended_next_agent": row.get::<_, Option<String>>(10)?,
                "created_at":             row.get::<_, String>(11)?,
                "updated_at":             row.get::<_, String>(12)?,
                "completed_at":           row.get::<_, Option<String>>(13)?,
            }))
        })?;
        rows.next().transpose()?
    };

    let mut plan = match plan_row {
        Some(p) => p,
        None    => return Ok(None),
    };

    // Attach phases + steps.
    let phases = get_plan_phases(conn, plan_id)?;
    plan["phases"] = Value::Array(phases);

    Ok(Some(plan))
}

fn get_plan_phases(conn: &Connection, plan_id: &str) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, order_index FROM phases WHERE plan_id = ?1 ORDER BY order_index",
    )?;
    let phase_rows: Vec<(String, String, i64)> = stmt
        .query_map([plan_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;

    let mut phases = Vec::new();
    for (phase_id, phase_name, order_idx) in phase_rows {
        let steps = get_phase_steps(conn, &phase_id)?;
        phases.push(json!({
            "id":          phase_id,
            "name":        phase_name,
            "order_index": order_idx,
            "steps":       steps,
        }));
    }
    Ok(phases)
}

fn get_phase_steps(conn: &Connection, phase_id: &str) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT id, task, type, status, assignee, notes, order_index,
                requires_confirmation, requires_user_confirmation, requires_validation,
                created_at, updated_at, completed_at, completed_by_agent
         FROM steps WHERE phase_id = ?1 ORDER BY order_index",
    )?;
    let rows = stmt.query_map([phase_id], |row| {
        Ok(json!({
            "id":                           row.get::<_, String>(0)?,
            "task":                         row.get::<_, String>(1)?,
            "type":                         row.get::<_, Option<String>>(2)?,
            "status":                       row.get::<_, String>(3)?,
            "assignee":                     row.get::<_, Option<String>>(4)?,
            "notes":                        row.get::<_, Option<String>>(5)?,
            "order_index":                  row.get::<_, i64>(6)?,
            "requires_confirmation":        row.get::<_, bool>(7)?,
            "requires_user_confirmation":   row.get::<_, bool>(8)?,
            "requires_validation":          row.get::<_, bool>(9)?,
            "created_at":                   row.get::<_, String>(10)?,
            "updated_at":                   row.get::<_, String>(11)?,
            "completed_at":                 row.get::<_, Option<String>>(12)?,
            "completed_by_agent":           row.get::<_, Option<String>>(13)?,
        }))
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}
