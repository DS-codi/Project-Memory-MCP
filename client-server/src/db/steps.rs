//! Step read/write queries for degraded-mode `memory_steps` handling.

use anyhow::{Context, Result};
use rusqlite::Connection;
use serde_json::{json, Value};

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Get the next pending step for a plan (respects dependency ordering).
pub fn get_next_pending(conn: &Connection, plan_id: &str) -> Result<Option<Value>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.task, s.type, s.status, s.assignee, s.notes,
                s.order_index, s.requires_confirmation, s.requires_user_confirmation,
                s.requires_validation, s.created_at, s.updated_at,
                s.completed_at, s.completed_by_agent,
                p.name AS phase_name
         FROM steps s
         JOIN phases p ON p.id = s.phase_id
         WHERE s.plan_id = ?1 AND s.status = 'pending'
           AND NOT EXISTS (
               SELECT 1 FROM dependencies d
               WHERE d.target_type = 'step'
                 AND d.target_id   = s.id
                 AND d.dep_type    = 'blocks'
                 AND d.dep_status  = 'pending'
           )
         ORDER BY p.order_index, s.order_index
         LIMIT 1",
    )?;
    let mut rows = stmt.query_map([plan_id], step_row_mapper)?;
    Ok(rows.next().transpose()?)
}

/// Get all steps for a plan ordered by phase then step index.
pub fn get_all_steps(conn: &Connection, plan_id: &str) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.task, s.type, s.status, s.assignee, s.notes,
                s.order_index, s.requires_confirmation, s.requires_user_confirmation,
                s.requires_validation, s.created_at, s.updated_at,
                s.completed_at, s.completed_by_agent,
                p.name AS phase_name
         FROM steps s
         JOIN phases p ON p.id = s.phase_id
         WHERE s.plan_id = ?1
         ORDER BY p.order_index, s.order_index",
    )?;
    let rows = stmt.query_map([plan_id], step_row_mapper)?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

fn step_row_mapper(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
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
        "phase_name":                   row.get::<_, Option<String>>(14)?,
    }))
}

/// Update a single step's status (and optionally notes / completed fields).
pub fn update_step(
    conn: &Connection,
    step_id: &str,
    status: Option<&str>,
    notes: Option<Option<&str>>,  // None = don't touch, Some(None) = clear, Some(Some(s)) = set
    completed_by_agent: Option<&str>,
) -> Result<()> {
    let now = now_iso();
    let completed_at: Option<String> = match status {
        Some("done") => Some(now.clone()),
        _ => None,
    };

    // Build the SET clause dynamically.
    let fields: Vec<&str> = vec!["updated_at = ?1"];
    let mut idx = 2usize;

    let mut status_param:          Option<String> = None;
    let mut notes_param:           Option<Option<String>> = None;
    let mut completed_at_param:    Option<Option<String>> = None;
    let mut completed_agent_param: Option<Option<String>> = None;

    let mut sql_fields = String::new();

    if let Some(s) = status {
        sql_fields.push_str(&format!(", status = ?{}", idx));
        idx += 1;
        status_param = Some(s.to_string());
        // completed_at
        sql_fields.push_str(&format!(", completed_at = ?{}", idx));
        idx += 1;
        completed_at_param = Some(completed_at);
    }
    if let Some(n) = notes {
        sql_fields.push_str(&format!(", notes = ?{}", idx));
        idx += 1;
        notes_param = Some(n.map(|s| s.to_string()));
    }
    if let Some(agent) = completed_by_agent {
        sql_fields.push_str(&format!(", completed_by_agent = ?{}", idx));
        idx += 1;
        completed_agent_param = Some(Some(agent.to_string()));
    }

    let _ = (fields, idx); // suppress unused warnings

    let sql = format!(
        "UPDATE steps SET updated_at = ?1{} WHERE id = ?last",
        sql_fields
    );

    // We need to build params dynamically. Use a helper that builds the full param list.
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

    if let Some(s) = status_param {
        params.push(Box::new(s));
    }
    if let Some(ca) = completed_at_param {
        params.push(Box::new(ca));
    }
    if let Some(n) = notes_param {
        params.push(Box::new(n));
    }
    if let Some(a) = completed_agent_param {
        params.push(Box::new(a));
    }
    params.push(Box::new(step_id.to_string()));

    // Re-number the last placeholder properly.
    let last_idx = params.len();
    let final_sql = sql.replace("?last", &format!("?{}", last_idx));

    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    conn.execute(&final_sql, refs.as_slice())
        .context("failed to update step")?;

    // If status → done, satisfy outgoing 'blocks' dependencies.
    if matches!(status, Some("done")) {
        conn.execute(
            "UPDATE dependencies
             SET dep_status = 'satisfied'
             WHERE source_type = 'step' AND source_id = ?1
               AND dep_type = 'blocks' AND dep_status = 'pending'",
            [step_id],
        )
        .context("failed to satisfy step dependencies")?;
    }

    Ok(())
}

/// Batch update multiple steps by id.
pub fn batch_update_steps(
    conn: &Connection,
    updates: &[BatchUpdate],
) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for u in updates {
        let notes_param: Option<Option<&str>> = u.notes.as_ref().map(|n| {
            n.as_ref().map(|s| s.as_str())
        });
        update_step(conn, &u.id, u.status.as_deref(), notes_param, None)?;
    }
    tx.commit()?;
    Ok(())
}

#[derive(Debug)]
pub struct BatchUpdate {
    pub id:     String,
    pub status: Option<String>,
    pub notes:  Option<Option<String>>,
}
