//! Invokable method implementations for FormApp.
//!
//! These are called from QML when the user interacts with the form.

use crate::cxxqt_bridge::ffi;
use cxx_qt::CxxQtType;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;

use pm_gui_forms::protocol::{
    Answer, AnswerValue, FormRequest, FormResponse, FormStatus, FormType, ResponseMetadata,
    RefinementRequestEntry, RefinementSession, QuestionDiff,
};
use pm_gui_forms::protocol::FormResponseTag;
use pm_gui_forms::transport::FormTransport;

impl ffi::FormApp {
    /// Store an answer for a question. Called from QML when user selects
    /// a radio option, types text, or makes a confirm/reject decision.
    pub fn set_answer(mut self: Pin<&mut Self>, question_id: QString, answer_json: QString) {
        let qid = question_id.to_string();
        let json = answer_json.to_string();

        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.answers.insert(qid, json);
        }

        // Rebuild the answers_json property for QML reactivity.
        self.as_mut().refresh_answers_json();
    }

    /// Auto-fill every unanswered question with the recommended option,
    /// then update the QML answers display.
    pub fn use_all_recommendations(mut self: Pin<&mut Self>) {
        let state_arc = self.rust().state.clone();

        let questions_json = {
            let state = state_arc.lock().unwrap();
            state.questions_json_cache.clone()
        };

        let questions: Vec<serde_json::Value> = serde_json::from_str(&questions_json)
            .unwrap_or_default();

        let mut new_answers: Vec<(String, String)> = Vec::new();

        for q in &questions {
            let q_id = q.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let q_type = q.get("type").and_then(|v| v.as_str()).unwrap_or("");

            // Skip if already answered.
            {
                let state = state_arc.lock().unwrap();
                if state.answers.contains_key(q_id) {
                    continue;
                }
            }

            let answer = build_recommendation_answer(q_type, q);
            if let Some(answer_json) = answer {
                new_answers.push((q_id.to_string(), answer_json));
            }
        }

        // Store all new answers.
        {
            let mut state = state_arc.lock().unwrap();
            for (qid, json) in new_answers {
                state.answers.insert(qid, json);
            }
        }

        self.as_mut().refresh_answers_json();
    }

    /// Submit the form — collects all answers, auto-fills unanswered
    /// questions with recommendations, and writes FormResponse to stdout.
    pub fn submit_form(mut self: Pin<&mut Self>) {
        if *self.as_ref().form_submitted() {
            return; // Prevent double-submit.
        }

        // Auto-fill unanswered questions first.
        self.as_mut().auto_fill_unanswered();

        let state_arc = self.rust().state.clone();
        let (request, answers_map) = {
            let state = state_arc.lock().unwrap();
            let req: FormRequest = serde_json::from_str(&state.request_json)
                .expect("cached request JSON must be valid");
            (req, state.answers.clone())
        };

        let answers = build_answer_list(&request, &answers_map);
        let auto_filled_count = answers.iter().filter(|a| a.auto_filled).count() as u32;

        // Build optional RefinementSession from accumulated round-trip data.
        let (refinement_count_val, refinement_session) = {
            let state = state_arc.lock().unwrap();
            let count = state.refinement_count;
            let session = if count > 0 {
                Some(RefinementSession {
                    round_trip_count: count,
                    question_diffs: state.refinement_diffs.clone(),
                    started_at: state.refinement_started_at.unwrap_or_else(chrono::Utc::now),
                    last_refined_at: state.last_refined_at,
                })
            } else {
                None
            };
            (count, session)
        };

        let response = FormResponse {
            message_type: FormResponseTag,
            version: 1,
            request_id: request.request_id,
            form_type: FormType::Brainstorm,
            status: FormStatus::Completed,
            metadata: ResponseMetadata {
                plan_id: request.metadata.plan_id.clone(),
                workspace_id: request.metadata.workspace_id.clone(),
                session_id: request.metadata.session_id.clone(),
                completed_at: Some(chrono::Utc::now()),
                duration_ms: 0,
                auto_filled_count,
                refinement_count: refinement_count_val,
            },
            answers,
            refinement_requests: Vec::new(),
            refinement_session,
        };

        write_response_blocking(&response);

        self.as_mut().set_form_submitted(true);
        self.as_mut().form_completed();
    }

    /// Cancel the form — writes a deferred FormResponse with partial answers.
    pub fn cancel_form(mut self: Pin<&mut Self>) {
        if *self.as_ref().form_submitted() {
            return;
        }

        let state_arc = self.rust().state.clone();
        let (request, answers_map) = {
            let state = state_arc.lock().unwrap();
            let req: FormRequest = serde_json::from_str(&state.request_json)
                .expect("cached request JSON must be valid");
            (req, state.answers.clone())
        };

        let answers = build_answer_list(&request, &answers_map);

        let response = FormResponse {
            message_type: FormResponseTag,
            version: 1,
            request_id: request.request_id,
            form_type: FormType::Brainstorm,
            status: FormStatus::Deferred,
            metadata: ResponseMetadata {
                plan_id: request.metadata.plan_id.clone(),
                workspace_id: request.metadata.workspace_id.clone(),
                session_id: request.metadata.session_id.clone(),
                completed_at: Some(chrono::Utc::now()),
                duration_ms: 0,
                auto_filled_count: 0,
                refinement_count: 0,
            },
            answers,
            refinement_requests: Vec::new(),
            refinement_session: None,
        };

        write_response_blocking(&response);

        self.as_mut().set_form_submitted(true);
        self.as_mut().form_completed();
    }

    /// Toggle the refinement flag for a question.
    pub fn toggle_refinement(self: Pin<&mut Self>, question_id: QString) {
        let qid = question_id.to_string();
        let refinement_key = format!("__refinement__{qid}");

        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        if state.answers.contains_key(&refinement_key) {
            state.answers.remove(&refinement_key);
        } else {
            state.answers.insert(refinement_key, "true".to_string());
        }
    }

    /// Store per-question user feedback text for the upcoming refinement request.
    pub fn set_refinement_feedback(self: Pin<&mut Self>, question_id: QString, feedback: QString) {
        let key = format!("__refinement_feedback__{}", question_id.to_string());
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.answers.insert(key, feedback.to_string());
    }

    /// Submit a refinement request for all questions currently marked for re-evaluation.
    ///
    /// Protocol:
    /// 1. Builds a `FormResponse(RefinementRequested)` and writes it to stdout.
    /// 2. Sets `refinementPending = true` while waiting for the Supervisor's reply.
    /// 3. Reads a `FormRefinementResponse` from stdin (sent by the Supervisor after
    ///    the Brainstorm agent has regenerated options).
    /// 4. Merges updated questions into the QML model, increments `refinementCount`,
    ///    clears refinement flags, and emits `refinementCompleted`.
    pub fn request_refinement(mut self: Pin<&mut Self>) {
        if *self.as_ref().form_submitted() {
            return; // Can't refine after final submission.
        }

        let state_arc = self.rust().state.clone();

        // Collect marked question IDs and per-question feedback.
        let (request, answers_map, transport_arc, current_refinement_count) = {
            let state = state_arc.lock().unwrap();
            let req: FormRequest = serde_json::from_str(&state.request_json)
                .expect("cached request JSON must be valid");
            let transport = state.transport.clone();
            let count = state.refinement_count;
            (req, state.answers.clone(), transport, count)
        };

        let mut question_ids: Vec<String> = Vec::new();
        let mut refinement_requests: Vec<RefinementRequestEntry> = Vec::new();

        for key in answers_map.keys() {
            if let Some(q_id) = key.strip_prefix("__refinement__") {
                if q_id.starts_with("feedback__") {
                    continue; // skip feedback sub-keys
                }
                let feedback_key = format!("__refinement_feedback__{q_id}");
                let feedback = answers_map.get(&feedback_key).cloned().unwrap_or_default();
                question_ids.push(q_id.to_string());
                refinement_requests.push(RefinementRequestEntry {
                    question_id: q_id.to_string(),
                    feedback,
                });
            }
        }

        if question_ids.is_empty() {
            return; // Nothing marked for refinement.
        }

        let Some(transport_arc) = transport_arc else {
            eprintln!("[brainstorm-gui] No transport available for refinement");
            return;
        };

        let answers = build_answer_list(&request, &answers_map);
        let auto_filled_count = answers.iter().filter(|a| a.auto_filled).count() as u32;

        let response = FormResponse {
            message_type: FormResponseTag,
            version: 1,
            request_id: request.request_id,
            form_type: FormType::Brainstorm,
            status: FormStatus::RefinementRequested,
            metadata: ResponseMetadata {
                plan_id: request.metadata.plan_id.clone(),
                workspace_id: request.metadata.workspace_id.clone(),
                session_id: request.metadata.session_id.clone(),
                completed_at: None,
                duration_ms: 0,
                auto_filled_count,
                refinement_count: current_refinement_count + 1,
            },
            answers,
            refinement_requests,
            refinement_session: None, // session is only on the final FormResponse
        };

        // Flip the loading indicator on the Qt thread before the async task starts.
        self.as_mut().set_refinement_pending(true);

        let qt_thread = self.qt_thread();

        tokio::spawn(async move {
            let mut transport = transport_arc.lock().await;

            // 1. Write FormResponse(RefinementRequested) → Supervisor.
            if let Err(e) = transport.write_response(&response).await {
                eprintln!("[brainstorm-gui] Failed to write refinement response: {e}");
                qt_thread
                    .queue(|mut app| app.as_mut().set_refinement_pending(false))
                    .ok();
                return;
            }

            // 2. Read FormRefinementResponse ← Supervisor (updated questions).
            let refinement_resp = match transport.read_refinement_response().await {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[brainstorm-gui] Failed to read FormRefinementResponse: {e}");
                    qt_thread
                        .queue(|mut app| app.as_mut().set_refinement_pending(false))
                        .ok();
                    return;
                }
            };

            let updated_json =
                serde_json::to_string(&refinement_resp.updated_questions).unwrap_or_else(|_| "[]".to_string());

            // 3. Merge updated questions into the questions cache and update AppState.
            {
                let mut state = state_arc.lock().unwrap();
                state.refinement_count += 1;

                let now = chrono::Utc::now();
                // Record start time on first round-trip.
                if state.refinement_started_at.is_none() {
                    state.refinement_started_at = Some(now);
                }
                state.last_refined_at = Some(now);

                let mut all_questions: Vec<serde_json::Value> =
                    serde_json::from_str(&state.questions_json_cache).unwrap_or_default();
                let updated_vals: Vec<serde_json::Value> =
                    serde_json::from_str(&updated_json).unwrap_or_default();

                // Record per-question diffs before merging.
                let orig_questions: Vec<serde_json::Value> =
                    serde_json::from_str(&state.original_questions_snapshot).unwrap_or_default();
                for updated_q in &updated_vals {
                    let updated_id =
                        updated_q.get("id").and_then(|v| v.as_str()).unwrap_or("");

                    let original_options: Vec<serde_json::Value> = orig_questions
                        .iter()
                        .find(|q| q.get("id").and_then(|v| v.as_str()).unwrap_or("") == updated_id)
                        .and_then(|q| q.get("options"))
                        .and_then(|o| o.as_array())
                        .cloned()
                        .unwrap_or_default();

                    let refined_options: Vec<serde_json::Value> = updated_q
                        .get("options")
                        .and_then(|o| o.as_array())
                        .cloned()
                        .unwrap_or_default();

                    state.refinement_diffs.push(QuestionDiff {
                        question_id: updated_id.to_string(),
                        original_options,
                        refined_options,
                        refined_at: now,
                    });
                }

                for updated_q in &updated_vals {
                    let updated_id =
                        updated_q.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    if let Some(slot) = all_questions.iter_mut().find(|q| {
                        q.get("id").and_then(|v| v.as_str()).unwrap_or("") == updated_id
                    }) {
                        *slot = updated_q.clone();
                    }
                }

                state.questions_json_cache =
                    serde_json::to_string(&all_questions).unwrap_or_default();

                // Clear refinement flags and feedback so the UI resets.
                state
                    .answers
                    .retain(|k, _| !k.starts_with("__refinement__"));
            }

            // 4. Push updated properties to QML on the Qt thread.
            qt_thread
                .queue(move |mut app| {
                    let (new_questions_json, new_count) = {
                        let sa = app.rust().state.clone();
                        let s = sa.lock().unwrap();
                        (s.questions_json_cache.clone(), s.refinement_count as i32)
                    };
                    app.as_mut()
                        .set_questions_json(QString::from(&new_questions_json));
                    app.as_mut()
                        .set_refined_questions_json(QString::from(&updated_json));
                    app.as_mut().set_refinement_count(new_count);
                    app.as_mut().set_refinement_pending(false);
                    // Refresh answers display (refinement flags cleared).
                    app.as_mut().refresh_answers_json();
                    app.as_mut().refinement_completed();
                })
                .ok();
        });
    }

    /// Submit an immediate refinement request for exactly one question.
    ///
    /// Convenience wrapper around the full refinement flow:
    /// sets only the named question's refinement mark (clearing all others first),
    /// stores the optional one-line `feedback`, then triggers the same
    /// round-trip as `requestRefinement()`.
    pub fn request_refinement_for_question(
        mut self: Pin<&mut Self>,
        question_id: QString,
        feedback: QString,
    ) {
        if *self.as_ref().form_submitted() || *self.as_ref().refinement_pending() {
            return;
        }

        let qid = question_id.to_string();
        let fb = feedback.to_string();

        {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            // Clear all existing refinement flags for a clean single-question request.
            state.answers.retain(|k, _| !k.starts_with("__refinement__"));
            // Mark just this question.
            state.answers.insert(format!("__refinement__{qid}"), "true".to_string());
            if !fb.is_empty() {
                state.answers.insert(format!("__refinement_feedback__{qid}"), fb);
            }
        }

        // Delegate to the standard batch refinement path (now with only one question marked).
        self.as_mut().request_refinement();
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

    // ── Private helpers ────────────────────────────────────────────

    /// Refresh the `answers_json` property from the internal answers map.
    fn refresh_answers_json(mut self: Pin<&mut Self>) {
        let state_arc = self.rust().state.clone();
        let json = {
            let state = state_arc.lock().unwrap();
            serde_json::to_string(&state.answers).unwrap_or_else(|_| "{}".to_string())
        };
        self.as_mut().set_answers_json(QString::from(&json));
    }

    /// Auto-fill any unanswered questions with their recommendations.
    fn auto_fill_unanswered(self: Pin<&mut Self>) {
        let state_arc = self.rust().state.clone();

        let questions_json = {
            let state = state_arc.lock().unwrap();
            state.questions_json_cache.clone()
        };

        let questions: Vec<serde_json::Value> = serde_json::from_str(&questions_json)
            .unwrap_or_default();

        let mut fills: Vec<(String, String)> = Vec::new();

        for q in &questions {
            let q_id = q.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let q_type = q.get("type").and_then(|v| v.as_str()).unwrap_or("");

            {
                let state = state_arc.lock().unwrap();
                if state.answers.contains_key(q_id) {
                    continue;
                }
            }

            if let Some(answer_json) = build_recommendation_answer(q_type, q) {
                fills.push((q_id.to_string(), answer_json));
            }
        }

        {
            let mut state = state_arc.lock().unwrap();
            for (qid, json) in fills {
                state.answers.entry(qid).or_insert(json);
            }
        }
    }
}

// ── Free functions ─────────────────────────────────────────────────

/// Build a recommendation-based answer JSON for a given question type.
fn build_recommendation_answer(q_type: &str, question: &serde_json::Value) -> Option<String> {
    match q_type {
        "radio_select" => {
            // Find the recommended option.
            let options = question.get("options")?.as_array()?;
            let recommended = options
                .iter()
                .find(|opt| opt.get("recommended").and_then(|r| r.as_bool()).unwrap_or(false));

            let selected_id = recommended
                .or_else(|| options.first())
                .and_then(|opt| opt.get("id"))
                .and_then(|v| v.as_str())?;

            let answer = serde_json::json!({
                "type": "radio_select_answer",
                "selected": selected_id
            });
            Some(answer.to_string())
        }
        "free_text" => {
            let default = question
                .get("default_value")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let answer = serde_json::json!({
                "type": "free_text_answer",
                "value": default
            });
            Some(answer.to_string())
        }
        "confirm_reject" => {
            let answer = serde_json::json!({
                "type": "confirm_reject_answer",
                "action": "approve"
            });
            Some(answer.to_string())
        }
        "countdown_timer" => {
            // Countdown timer answers are auto-filled by the timer task.
            None
        }
        _ => None,
    }
}

/// Build the final Answer list from the stored answers map and the request.
fn build_answer_list(
    request: &FormRequest,
    answers_map: &std::collections::HashMap<String, String>,
) -> Vec<Answer> {
    let mut answers = Vec::new();

    for question in &request.questions {
        let (q_id, q_type) = match question {
            pm_gui_forms::protocol::Question::RadioSelect(q) => (&q.id, "radio_select"),
            pm_gui_forms::protocol::Question::FreeText(q) => (&q.id, "free_text"),
            pm_gui_forms::protocol::Question::ConfirmReject(q) => (&q.id, "confirm_reject"),
            pm_gui_forms::protocol::Question::CountdownTimer(q) => (&q.id, "countdown_timer"),
        };

        let is_auto_filled;
        let answer_value: AnswerValue;

        if let Some(json_str) = answers_map.get(q_id) {
            is_auto_filled = false;
            answer_value = match serde_json::from_str(json_str) {
                Ok(val) => val,
                Err(_) => continue,
            };
        } else {
            // Auto-fill with recommendation.
            is_auto_filled = true;
            let q_json = serde_json::to_value(question).unwrap_or_default();
            let fill_json = build_recommendation_answer(q_type, &q_json);
            match fill_json {
                Some(j) => {
                    answer_value = match serde_json::from_str(&j) {
                        Ok(val) => val,
                        Err(_) => continue,
                    };
                }
                None => continue,
            }
        }

        let refinement_key = format!("__refinement__{q_id}");
        let marked_for_refinement = answers_map.contains_key(&refinement_key);

        answers.push(Answer {
            question_id: q_id.clone(),
            value: answer_value,
            auto_filled: is_auto_filled,
            marked_for_refinement,
        });
    }

    answers
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
