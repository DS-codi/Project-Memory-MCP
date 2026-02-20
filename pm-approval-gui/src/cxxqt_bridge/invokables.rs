//! Invokable method implementations for ApprovalApp.
//!
//! Handles approve, reject, notes, and timer pause/resume.

use crate::cxxqt_bridge::ffi;
use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use std::pin::Pin;

use pm_gui_forms::protocol::{
    Answer, AnswerValue, FormRequest, FormResponse, FormResponseTag,
    FormStatus, FormType, ResponseMetadata,
};

impl ffi::ApprovalApp {
    /// Approve the gated step — writes a completed FormResponse to stdout.
    pub fn approve(mut self: Pin<&mut Self>) {
        if *self.as_ref().form_submitted() {
            return;
        }

        let state_arc = self.rust().state.clone();
        let request = {
            let state = state_arc.lock().unwrap();
            serde_json::from_str::<FormRequest>(&state.request_json)
                .expect("cached request JSON must be valid")
        };

        let user_notes = {
            let state = state_arc.lock().unwrap();
            let notes = state.user_notes.clone();
            if notes.is_empty() { None } else { Some(notes) }
        };

        let remaining = *self.as_ref().remaining_seconds();
        let total = *self.as_ref().total_seconds();
        let elapsed = (total - remaining).max(0) as u64;
        let timed_out = remaining == 0;

        let status = if timed_out {
            FormStatus::TimedOut
        } else {
            FormStatus::Completed
        };

        let answers = build_approval_answers("approve", user_notes, elapsed as u32, timed_out);

        let response = FormResponse {
            message_type: FormResponseTag,
            version: 1,
            request_id: request.request_id,
            form_type: FormType::Approval,
            status,
            metadata: ResponseMetadata {
                plan_id: request.metadata.plan_id.clone(),
                workspace_id: request.metadata.workspace_id.clone(),
                session_id: request.metadata.session_id.clone(),
                completed_at: Some(chrono::Utc::now()),
                duration_ms: elapsed * 1000,
                auto_filled_count: if timed_out { 2 } else { 0 },
            },
            answers,
            refinement_requests: Vec::new(),
        };

        write_response_blocking(&response);

        self.as_mut().set_form_submitted(true);
        self.as_mut().form_completed();
    }

    /// Reject the gated step — writes a cancelled FormResponse to stdout.
    pub fn reject(mut self: Pin<&mut Self>) {
        if *self.as_ref().form_submitted() {
            return;
        }

        let state_arc = self.rust().state.clone();
        let request = {
            let state = state_arc.lock().unwrap();
            serde_json::from_str::<FormRequest>(&state.request_json)
                .expect("cached request JSON must be valid")
        };

        let user_notes = {
            let state = state_arc.lock().unwrap();
            let notes = state.user_notes.clone();
            if notes.is_empty() { None } else { Some(notes) }
        };

        let remaining = *self.as_ref().remaining_seconds();
        let total = *self.as_ref().total_seconds();
        let elapsed = (total - remaining).max(0) as u64;
        let timed_out = remaining == 0;

        let status = if timed_out {
            FormStatus::Deferred
        } else {
            FormStatus::Cancelled
        };

        let answers = build_approval_answers("reject", user_notes, elapsed as u32, timed_out);

        let response = FormResponse {
            message_type: FormResponseTag,
            version: 1,
            request_id: request.request_id,
            form_type: FormType::Approval,
            status,
            metadata: ResponseMetadata {
                plan_id: request.metadata.plan_id.clone(),
                workspace_id: request.metadata.workspace_id.clone(),
                session_id: request.metadata.session_id.clone(),
                completed_at: Some(chrono::Utc::now()),
                duration_ms: elapsed * 1000,
                auto_filled_count: if timed_out { 2 } else { 0 },
            },
            answers,
            refinement_requests: Vec::new(),
        };

        write_response_blocking(&response);

        self.as_mut().set_form_submitted(true);
        self.as_mut().form_completed();
    }

    /// Set the user notes text (called from QML on text change).
    pub fn set_notes(self: Pin<&mut Self>, notes: QString) {
        let notes_str = notes.to_string();
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.user_notes = notes_str;
    }

    /// Pause the countdown timer.
    pub fn pause_timer(mut self: Pin<&mut Self>) {
        self.as_mut().set_timer_paused(true);
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.timer_paused = true;
    }

    /// Resume the countdown timer.
    pub fn resume_timer(mut self: Pin<&mut Self>) {
        self.as_mut().set_timer_paused(false);
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.timer_paused = false;
    }
}

// ── Free functions ─────────────────────────────────────────────────

/// Build the fixed Answer list for an approval response.
///
/// Uses the standard question IDs: `approval_decision` and `approval_timer`.
fn build_approval_answers(
    action: &str,
    notes: Option<String>,
    elapsed_seconds: u32,
    timed_out: bool,
) -> Vec<Answer> {
    let mut decision_value = serde_json::json!({
        "type": "confirm_reject_answer",
        "action": action,
    });
    if let Some(n) = &notes {
        decision_value["notes"] = serde_json::json!(n);
    }

    let timer_result = if timed_out { "timed_out" } else { "completed" };
    let timer_value = serde_json::json!({
        "type": "countdown_timer_answer",
        "result": timer_result,
        "elapsed_seconds": elapsed_seconds,
    });

    vec![
        Answer {
            question_id: "approval_decision".to_string(),
            value: serde_json::from_value(decision_value).unwrap(),
            auto_filled: timed_out,
            marked_for_refinement: false,
        },
        Answer {
            question_id: "approval_timer".to_string(),
            value: serde_json::from_value(timer_value).unwrap(),
            auto_filled: timed_out,
            marked_for_refinement: false,
        },
    ]
}

/// Write FormResponse to stdout synchronously (blocking).
fn write_response_blocking(response: &FormResponse) {
    use std::io::Write;
    let json = serde_json::to_string(response).expect("FormResponse must serialize");
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    writeln!(handle, "{json}").expect("Failed to write to stdout");
    handle.flush().expect("Failed to flush stdout");
}
