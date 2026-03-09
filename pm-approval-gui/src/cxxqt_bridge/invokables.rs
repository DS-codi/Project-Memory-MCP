//! Invokable method implementations for ApprovalApp.
//!
//! Handles approve, reject, notes, and timer pause/resume.

use crate::cxxqt_bridge::{ffi, ApprovalRenderMode};
use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use std::pin::Pin;

use pm_gui_forms::protocol::{
    Answer, AnswerValue, ApprovalDecisionPayloadV2, ApprovalDecisionState,
    ApprovalMode, ApprovalRequestContextV2, ApprovalSessionItemDecisionV2,
    ConfirmRejectAction, FormRequest, FormResponse, FormResponseTag, FormStatus,
    FormType, Question, ResponseMetadata, TimerResult,
};

#[derive(Debug, Clone, Copy)]
enum SubmissionIntent {
    Approve,
    Reject,
    SubmitSelection,
}

struct SubmissionBuild {
    status: FormStatus,
    answers: Vec<Answer>,
    auto_filled_count: u32,
}

#[derive(Debug, Clone)]
struct MultiSessionMeta {
    session_id: String,
    require_all_responses: bool,
    expected_item_ids: Vec<String>,
}

impl ffi::ApprovalApp {
    /// Approve the gated step — writes a completed FormResponse to stdout.
    pub fn approve(self: Pin<&mut Self>) {
        submit_with_intent(self, SubmissionIntent::Approve);
    }

    /// Reject the gated step — writes a cancelled FormResponse to stdout.
    pub fn reject(self: Pin<&mut Self>) {
        submit_with_intent(self, SubmissionIntent::Reject);
    }

    /// Submit the selected multiple-choice option.
    pub fn submit_selection(self: Pin<&mut Self>) {
        submit_with_intent(self, SubmissionIntent::SubmitSelection);
    }

    /// Set the user notes text (called from QML on text change).
    pub fn set_notes(self: Pin<&mut Self>, notes: QString) {
        let notes_str = notes.to_string();
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.user_notes = notes_str;
    }

    /// Set the selected option id for multiple-choice mode.
    pub fn set_selected_option(mut self: Pin<&mut Self>, option_id: QString) {
        let option = option_id.to_string();
        self.as_mut().set_selected_option_id(QString::from(&option));

        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.selected_option_id = if option.trim().is_empty() {
            None
        } else {
            Some(option)
        };
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

fn submit_with_intent(mut app: Pin<&mut ffi::ApprovalApp>, intent: SubmissionIntent) {
    if *app.as_ref().form_submitted() {
        return;
    }

    let state_arc = app.rust().state.clone();
    let (request, mode, mut question_id, selected_option_id, user_notes) = {
        let state = state_arc.lock().unwrap();
        (
            serde_json::from_str::<FormRequest>(&state.request_json)
                .expect("cached request JSON must be valid"),
            state.mode,
            state.decision_question_id.clone(),
            state.selected_option_id.clone(),
            if state.user_notes.is_empty() {
                None
            } else {
                Some(state.user_notes.clone())
            },
        )
    };

    if question_id.trim().is_empty() {
        question_id = find_decision_question_id(&request, mode)
            .unwrap_or_else(|| "approval_decision".to_string());
    }

    let remaining = *app.as_ref().remaining_seconds();
    let total = *app.as_ref().total_seconds();
    let elapsed_seconds = (total - remaining).max(0) as u32;
    let timed_out = remaining == 0;
    let multi_session_meta = extract_multi_session_meta(&request);

    let mut effective_selected = selected_option_id.filter(|value| !value.trim().is_empty());
    if matches!(mode, ApprovalRenderMode::MultipleChoice)
        && effective_selected.is_none()
        && multi_session_meta.is_none()
    {
        effective_selected = default_selected_option_id(&request, &question_id);
    }

    if let Some(selected) = effective_selected.as_ref() {
        app.as_mut().set_selected_option_id(QString::from(selected));
        let mut state = state_arc.lock().unwrap();
        state.selected_option_id = Some(selected.clone());
    }

    let submission = build_submission(
        mode,
        intent,
        &request,
        &question_id,
        effective_selected,
        user_notes,
        elapsed_seconds,
        timed_out,
        multi_session_meta,
    );

    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: request.request_id,
        form_type: FormType::Approval,
        status: submission.status,
        metadata: ResponseMetadata {
            plan_id: request.metadata.plan_id.clone(),
            workspace_id: request.metadata.workspace_id.clone(),
            session_id: request.metadata.session_id.clone(),
            completed_at: Some(chrono::Utc::now()),
            duration_ms: (elapsed_seconds as u64) * 1000,
            auto_filled_count: submission.auto_filled_count,
            refinement_count: 0,
        },
        answers: submission.answers,
        refinement_requests: Vec::new(),
        refinement_session: None,
    };

    write_response_blocking(&response);

    app.as_mut().set_form_submitted(true);
    app.as_mut().form_completed();
}

fn build_submission(
    mode: ApprovalRenderMode,
    intent: SubmissionIntent,
    request: &FormRequest,
    decision_question_id: &str,
    selected_option_id: Option<String>,
    notes: Option<String>,
    elapsed_seconds: u32,
    timed_out: bool,
    multi_session_meta: Option<MultiSessionMeta>,
) -> SubmissionBuild {
    if let Some(meta) = multi_session_meta {
        return build_multi_session_submission(
            intent,
            request,
            decision_question_id,
            selected_option_id,
            notes,
            elapsed_seconds,
            timed_out,
            &meta,
        );
    }

    let timer_question_id = find_timer_question_id(request)
        .unwrap_or_else(|| "approval_timer".to_string());

    let mut answers = Vec::new();
    let mut auto_filled_count = 0;

    let status = match (mode, intent) {
        (ApprovalRenderMode::Binary, SubmissionIntent::Reject) => {
            let action = ConfirmRejectAction::Reject;
            answers.push(Answer {
                question_id: decision_question_id.to_string(),
                value: AnswerValue::ConfirmRejectAnswer { action, notes },
                auto_filled: timed_out,
                marked_for_refinement: false,
            });
            if timed_out {
                auto_filled_count += 1;
                FormStatus::Deferred
            } else {
                FormStatus::Cancelled
            }
        }
        (ApprovalRenderMode::Binary, SubmissionIntent::Approve)
        | (ApprovalRenderMode::Binary, SubmissionIntent::SubmitSelection) => {
            let action = ConfirmRejectAction::Approve;
            answers.push(Answer {
                question_id: decision_question_id.to_string(),
                value: AnswerValue::ConfirmRejectAnswer { action, notes },
                auto_filled: timed_out,
                marked_for_refinement: false,
            });
            if timed_out {
                auto_filled_count += 1;
                FormStatus::TimedOut
            } else {
                FormStatus::Completed
            }
        }
        (ApprovalRenderMode::MultipleChoice, SubmissionIntent::Reject) => {
            if timed_out {
                FormStatus::Deferred
            } else {
                FormStatus::Cancelled
            }
        }
        (ApprovalRenderMode::MultipleChoice, SubmissionIntent::Approve)
        | (ApprovalRenderMode::MultipleChoice, SubmissionIntent::SubmitSelection) => {
            if let Some(selected) = selected_option_id {
                answers.push(Answer {
                    question_id: decision_question_id.to_string(),
                    value: AnswerValue::RadioSelectAnswer {
                        selected,
                        free_text: notes,
                    },
                    auto_filled: timed_out,
                    marked_for_refinement: false,
                });
                if timed_out {
                    auto_filled_count += 1;
                    FormStatus::TimedOut
                } else {
                    FormStatus::Completed
                }
            } else if timed_out {
                FormStatus::TimedOut
            } else {
                FormStatus::Cancelled
            }
        }
    };

    answers.push(Answer {
        question_id: timer_question_id,
        value: AnswerValue::CountdownTimerAnswer {
            result: if timed_out {
                TimerResult::TimedOut
            } else {
                TimerResult::Completed
            },
            elapsed_seconds,
        },
        auto_filled: timed_out,
        marked_for_refinement: false,
    });
    if timed_out {
        auto_filled_count += 1;
    }

    SubmissionBuild {
        status,
        answers,
        auto_filled_count,
    }
}

fn build_multi_session_submission(
    intent: SubmissionIntent,
    request: &FormRequest,
    decision_question_id: &str,
    selected_option_id: Option<String>,
    notes: Option<String>,
    elapsed_seconds: u32,
    timed_out: bool,
    meta: &MultiSessionMeta,
) -> SubmissionBuild {
    let timer_question_id =
        find_timer_question_id(request).unwrap_or_else(|| "approval_timer".to_string());

    let mut answers = Vec::new();
    let mut auto_filled_count = 0;

    let mut decision_payload = notes
        .as_deref()
        .and_then(|raw| ApprovalDecisionPayloadV2::parse_multi_session_submission_json(raw).ok())
        .unwrap_or_else(|| {
            fallback_multi_session_payload(
                intent,
                request,
                decision_question_id,
                selected_option_id,
                notes,
                timed_out,
                meta,
            )
        });

    if decision_payload
        .session_id
        .as_ref()
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
    {
        decision_payload.session_id = Some(meta.session_id.clone());
    }

    let status = multi_session_status(&decision_payload, timed_out, meta);

    answers.push(Answer {
        question_id: decision_question_id.to_string(),
        value: AnswerValue::ApprovalDecisionV2 {
            decision: decision_payload,
        },
        auto_filled: timed_out,
        marked_for_refinement: false,
    });
    if timed_out {
        auto_filled_count += 1;
    }

    answers.push(Answer {
        question_id: timer_question_id,
        value: AnswerValue::CountdownTimerAnswer {
            result: if timed_out {
                TimerResult::TimedOut
            } else {
                TimerResult::Completed
            },
            elapsed_seconds,
        },
        auto_filled: timed_out,
        marked_for_refinement: false,
    });
    if timed_out {
        auto_filled_count += 1;
    }

    SubmissionBuild {
        status,
        answers,
        auto_filled_count,
    }
}

fn fallback_multi_session_payload(
    intent: SubmissionIntent,
    request: &FormRequest,
    decision_question_id: &str,
    selected_option_id: Option<String>,
    notes: Option<String>,
    timed_out: bool,
    meta: &MultiSessionMeta,
) -> ApprovalDecisionPayloadV2 {
    let mut decisions = Vec::new();

    if !timed_out {
        let item_id = first_multi_item_id(request, decision_question_id, meta);
        if !item_id.trim().is_empty() {
            let mut item_decision = ApprovalSessionItemDecisionV2 {
                item_id,
                decision: ApprovalDecisionState::NoDecision,
                selected: None,
                notes: notes.filter(|value| !value.trim().is_empty()),
            };

            match intent {
                SubmissionIntent::Reject => {
                    item_decision.decision = ApprovalDecisionState::Reject;
                }
                SubmissionIntent::Approve | SubmissionIntent::SubmitSelection => {
                    if let Some(selected) = selected_option_id.filter(|value| !value.trim().is_empty())
                    {
                        item_decision.decision = ApprovalDecisionState::Approve;
                        item_decision.selected = Some(selected);
                    }
                }
            }

            decisions.push(item_decision);
        }
    }

    ApprovalDecisionPayloadV2 {
        mode: ApprovalMode::MultiApprovalSession,
        action: None,
        selected: None,
        session_id: Some(meta.session_id.clone()),
        decisions,
        notes: None,
    }
}

fn multi_session_status(
    payload: &ApprovalDecisionPayloadV2,
    timed_out: bool,
    meta: &MultiSessionMeta,
) -> FormStatus {
    let has_any_decision = !payload.decisions.is_empty();
    let has_deferred_entries = payload.decisions.iter().any(|item| {
        matches!(
            item.decision,
            ApprovalDecisionState::NoDecision | ApprovalDecisionState::Defer
        )
    });
    let missing_required_entries = meta.require_all_responses
        && !meta.expected_item_ids.is_empty()
        && meta
            .expected_item_ids
            .iter()
            .any(|required| !payload.decisions.iter().any(|item| item.item_id == *required));

    if timed_out {
        if has_any_decision && !has_deferred_entries && !missing_required_entries {
            FormStatus::TimedOut
        } else {
            FormStatus::Deferred
        }
    } else if !has_any_decision || has_deferred_entries || missing_required_entries {
        FormStatus::Deferred
    } else {
        FormStatus::Completed
    }
}

fn extract_multi_session_meta(request: &FormRequest) -> Option<MultiSessionMeta> {
    let context = request.context.as_ref()?;
    let v2_context = serde_json::from_value::<ApprovalRequestContextV2>(context.clone()).ok()?;
    if v2_context.contract.mode != ApprovalMode::MultiApprovalSession {
        return None;
    }

    let mut expected_item_ids = v2_context
        .contract
        .session
        .as_ref()
        .map(|session| {
            session
                .item_ids
                .iter()
                .filter_map(|item_id| {
                    if item_id.trim().is_empty() {
                        None
                    } else {
                        Some(item_id.clone())
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if expected_item_ids.is_empty() {
        expected_item_ids = collect_multi_item_ids_from_request(request);
    }

    let session_id = v2_context
        .contract
        .session
        .as_ref()
        .and_then(|session| {
            if session.session_id.trim().is_empty() {
                None
            } else {
                Some(session.session_id.clone())
            }
        })
        .unwrap_or_else(|| request.request_id.to_string());

    let require_all_responses = v2_context
        .contract
        .session
        .as_ref()
        .map(|session| session.require_all_responses)
        .unwrap_or(false);

    Some(MultiSessionMeta {
        session_id,
        require_all_responses,
        expected_item_ids,
    })
}

fn collect_multi_item_ids_from_request(request: &FormRequest) -> Vec<String> {
    let mut item_ids = Vec::new();

    for (index, question) in request.questions.iter().enumerate() {
        match question {
            Question::ConfirmReject(q) => {
                if q.id.trim().is_empty() {
                    item_ids.push(format!("item_{}", index + 1));
                } else {
                    item_ids.push(q.id.clone());
                }
            }
            Question::RadioSelect(q) => {
                if q.id.trim().is_empty() {
                    item_ids.push(format!("item_{}", index + 1));
                } else {
                    item_ids.push(q.id.clone());
                }
            }
            _ => {}
        }
    }

    item_ids
}

fn first_multi_item_id(
    request: &FormRequest,
    decision_question_id: &str,
    meta: &MultiSessionMeta,
) -> String {
    if let Some(item_id) = meta.expected_item_ids.first() {
        if !item_id.trim().is_empty() {
            return item_id.clone();
        }
    }

    if let Some(item_id) = collect_multi_item_ids_from_request(request)
        .into_iter()
        .find(|item_id| !item_id.trim().is_empty())
    {
        return item_id;
    }

    if !decision_question_id.trim().is_empty() {
        return decision_question_id.to_string();
    }

    "approval_item_1".to_string()
}

fn find_decision_question_id(request: &FormRequest, mode: ApprovalRenderMode) -> Option<String> {
    let primary = request.questions.iter().find_map(|question| match (mode, question) {
        (ApprovalRenderMode::Binary, Question::ConfirmReject(q)) if !q.id.trim().is_empty() => {
            Some(q.id.clone())
        }
        (ApprovalRenderMode::MultipleChoice, Question::RadioSelect(q))
            if !q.id.trim().is_empty() =>
        {
            Some(q.id.clone())
        }
        _ => None,
    });

    if primary.is_some() {
        return primary;
    }

    request.questions.iter().find_map(|question| match question {
        Question::ConfirmReject(q) if !q.id.trim().is_empty() => Some(q.id.clone()),
        Question::RadioSelect(q) if !q.id.trim().is_empty() => Some(q.id.clone()),
        _ => None,
    })
}

fn find_timer_question_id(request: &FormRequest) -> Option<String> {
    request.questions.iter().find_map(|question| match question {
        Question::CountdownTimer(q) if !q.id.trim().is_empty() => Some(q.id.clone()),
        _ => None,
    })
}

fn default_selected_option_id(request: &FormRequest, question_id: &str) -> Option<String> {
    let preferred = request.questions.iter().find_map(|question| match question {
        Question::RadioSelect(q) if q.id == question_id => Some(q),
        _ => None,
    });

    let radio_question = preferred.or_else(|| {
        request.questions.iter().find_map(|question| match question {
            Question::RadioSelect(q) => Some(q),
            _ => None,
        })
    })?;

    radio_question
        .options
        .iter()
        .find(|option| option.recommended)
        .or_else(|| radio_question.options.first())
        .map(|option| option.id.trim().to_string())
        .filter(|option_id| !option_id.is_empty())
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
