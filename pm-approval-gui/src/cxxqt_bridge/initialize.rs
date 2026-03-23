//! Initialize impl for ApprovalApp — reads FormRequest from stdin,
//! populates QML properties (including step context), and starts the
//! countdown timer task.

use crate::cxxqt_bridge::{ffi, ApprovalRenderMode};
use cxx_qt::CxxQtType;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;

use pm_gui_forms::protocol::{
    ApprovalMode, ApprovalRequestContextV2, ApprovalStepContext, ConfirmRejectQuestion,
    ApprovalSessionContract, FormRequest, Question, RadioOption, RadioSelectQuestion,
    TimeoutAction,
};

#[derive(Debug, Clone)]
struct DecisionUiConfig {
    mode: ApprovalRenderMode,
    question_id: String,
    label: String,
    description: String,
    approve_label: String,
    reject_label: String,
    allow_notes: bool,
    notes_placeholder: String,
    allow_free_text: bool,
    choice_options_json: String,
    selected_option_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
struct MultiSessionUiPayload {
    multi_session: bool,
    session_id: String,
    require_all_responses: bool,
    items: Vec<MultiSessionUiItem>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct MultiSessionUiItem {
    item_id: String,
    question_id: String,
    mode: String,
    label: String,
    description: String,
    approve_label: String,
    reject_label: String,
    allow_notes: bool,
    notes_placeholder: String,
    allow_free_text: bool,
    options: Vec<RadioOption>,
    default_selected_option_id: String,
}

impl cxx_qt::Initialize for ffi::ApprovalApp {
    fn initialize(self: Pin<&mut Self>) {
        let qt_thread = self.qt_thread();
        let state_arc = self.rust().state.clone();

        let qt_thread_timer = self.qt_thread();
        let state_arc_timer = self.rust().state.clone();

        tokio::spawn(async move {
            // Read FormRequest from stdin via StdioTransport.
            let request = match read_form_request().await {
                Ok(req) => req,
                Err(err) => {
                    eprintln!("Failed to read FormRequest from stdin: {err}");
                    std::process::exit(1);
                }
            };

            let title = request.metadata.title.clone();
            let duration = request.timeout.duration_seconds as i32;
            let on_timeout = timeout_action_name(request.timeout.on_timeout).to_string();

            let (step_ctx, mode_hint, session_contract) = parse_approval_context(&request);
            let decision_ui = derive_decision_ui(&request, mode_hint, session_contract.as_ref());

            // Extract step context from the optional context field.
            let plan_title = step_ctx
                .as_ref()
                .map(|c| c.plan_title.clone())
                .unwrap_or_default();
            let phase = step_ctx
                .as_ref()
                .map(|c| c.phase.clone())
                .unwrap_or_default();
            let step_task = step_ctx
                .as_ref()
                .map(|c| c.step_task.clone())
                .unwrap_or_else(|| {
                    request
                        .metadata
                        .description
                        .clone()
                        .unwrap_or_default()
                });
            let step_index = step_ctx.as_ref().map(|c| c.step_index as i32).unwrap_or(0);
            let urgency = step_ctx
                .as_ref()
                .map(|c| format!("{:?}", c.urgency).to_lowercase())
                .unwrap_or_else(|| "medium".to_string());

            // Cache the full request JSON for response construction.
            let request_json = serde_json::to_string(&request).unwrap_or_default();

            // Store in shared state.
            {
                let mut state = state_arc.lock().unwrap();
                state.request_json = request_json;
                state.on_timeout_action = on_timeout;
                state.user_notes.clear();
                state.mode = decision_ui.mode;
                state.decision_question_id = decision_ui.question_id.clone();
                state.selected_option_id = if decision_ui.selected_option_id.is_empty() {
                    None
                } else {
                    Some(decision_ui.selected_option_id.clone())
                };
            }

            // Update QML properties on the Qt thread.
            let multiple_choice_mode = matches!(decision_ui.mode, ApprovalRenderMode::MultipleChoice);
            let decision_label = decision_ui.label.clone();
            let decision_description = decision_ui.description.clone();
            let decision_question_id = decision_ui.question_id.clone();
            let approve_label = decision_ui.approve_label.clone();
            let reject_label = decision_ui.reject_label.clone();
            let allow_notes = decision_ui.allow_notes;
            let notes_placeholder = decision_ui.notes_placeholder.clone();
            let allow_free_text = decision_ui.allow_free_text;
            let choice_options_json = decision_ui.choice_options_json.clone();
            let selected_option_id = decision_ui.selected_option_id.clone();

            qt_thread
                .queue(move |mut qobj| {
                    qobj.as_mut().set_title(QString::from(&title));
                    qobj.as_mut().set_plan_title(QString::from(&plan_title));
                    qobj.as_mut().set_phase(QString::from(&phase));
                    qobj.as_mut().set_step_task(QString::from(&step_task));
                    qobj.as_mut().set_step_index(step_index);
                    qobj.as_mut().set_urgency(QString::from(&urgency));
                    qobj.as_mut().set_remaining_seconds(duration);
                    qobj.as_mut().set_total_seconds(duration);
                    qobj.as_mut().set_multiple_choice_mode(multiple_choice_mode);
                    qobj.as_mut().set_decision_label(QString::from(&decision_label));
                    qobj.as_mut()
                        .set_decision_description(QString::from(&decision_description));
                    qobj.as_mut()
                        .set_decision_question_id(QString::from(&decision_question_id));
                    qobj.as_mut().set_approve_label(QString::from(&approve_label));
                    qobj.as_mut().set_reject_label(QString::from(&reject_label));
                    qobj.as_mut().set_allow_notes(allow_notes);
                    qobj.as_mut()
                        .set_notes_placeholder(QString::from(&notes_placeholder));
                    qobj.as_mut().set_allow_free_text(allow_free_text);
                    qobj.as_mut()
                        .set_choice_options_json(QString::from(&choice_options_json));
                    qobj.as_mut()
                        .set_selected_option_id(QString::from(&selected_option_id));
                })
                .unwrap();

            // Start countdown timer task.
            spawn_timer_task(qt_thread_timer, state_arc_timer, duration as u32).await;
        });
    }
}

/// Read a FormRequest from stdin using the StdioTransport.
async fn read_form_request(
) -> Result<pm_gui_forms::protocol::FormRequest, pm_gui_forms::transport::TransportError> {
    let mut transport = pm_gui_forms::transport::StdioTransport::new();
    use pm_gui_forms::transport::FormTransport;
    transport.read_request().await
}

fn timeout_action_name(action: TimeoutAction) -> &'static str {
    match action {
        TimeoutAction::AutoFill => "auto_fill",
        TimeoutAction::Approve => "approve",
        TimeoutAction::Reject => "reject",
        TimeoutAction::Defer => "defer",
    }
}

fn parse_approval_context(
    request: &FormRequest,
) -> (
    Option<ApprovalStepContext>,
    Option<ApprovalMode>,
    Option<ApprovalSessionContract>,
) {
    let Some(context) = request.context.as_ref() else {
        return (None, None, None);
    };

    if let Ok(v2_context) = serde_json::from_value::<ApprovalRequestContextV2>(context.clone()) {
        return (
            Some(v2_context.step),
            Some(v2_context.contract.mode),
            v2_context.contract.session,
        );
    }

    let step_only = serde_json::from_value::<ApprovalStepContext>(context.clone()).ok();
    (step_only, None, None)
}

fn derive_decision_ui(
    request: &FormRequest,
    mode_hint: Option<ApprovalMode>,
    session_contract: Option<&ApprovalSessionContract>,
) -> DecisionUiConfig {
    if matches!(mode_hint, Some(ApprovalMode::MultiApprovalSession)) {
        if let Some(config) = multi_session_config(request, session_contract) {
            return config;
        }
    }

    let mut confirm_question: Option<&ConfirmRejectQuestion> = None;
    let mut radio_question: Option<&RadioSelectQuestion> = None;

    for question in &request.questions {
        match question {
            Question::ConfirmReject(q) if confirm_question.is_none() => {
                confirm_question = Some(q);
            }
            Question::RadioSelect(q) if radio_question.is_none() => {
                radio_question = Some(q);
            }
            _ => {}
        }
    }

    let preferred_mode = match mode_hint {
        Some(ApprovalMode::MultipleChoice) => ApprovalMode::MultipleChoice,
        Some(ApprovalMode::Binary) => ApprovalMode::Binary,
        _ => {
            if radio_question.is_some() && confirm_question.is_none() {
                ApprovalMode::MultipleChoice
            } else {
                ApprovalMode::Binary
            }
        }
    };

    match preferred_mode {
        ApprovalMode::MultipleChoice => {
            if let Some(radio) = radio_question {
                multiple_choice_config(radio)
            } else {
                binary_config_from_question(confirm_question, request)
            }
        }
        _ => {
            if let Some(confirm) = confirm_question {
                binary_config_from_question(Some(confirm), request)
            } else if let Some(radio) = radio_question {
                multiple_choice_config(radio)
            } else {
                binary_config_from_question(None, request)
            }
        }
    }
}

fn binary_config_from_question(
    question: Option<&ConfirmRejectQuestion>,
    request: &FormRequest,
) -> DecisionUiConfig {
    let fallback_label = request
        .metadata
        .description
        .clone()
        .unwrap_or_else(|| "Approve this step?".to_string());

    let (question_id, label, description, approve_label, reject_label, allow_notes, notes_placeholder) =
        if let Some(q) = question {
            let question_id = if q.id.trim().is_empty() {
                "approval_decision".to_string()
            } else {
                q.id.clone()
            };
            let notes_placeholder = q
                .notes_placeholder
                .clone()
                .unwrap_or_else(|| "Add notes about your decision (optional)".to_string());
            (
                question_id,
                q.label.clone(),
                q.description.clone().unwrap_or_default(),
                q.approve_label.clone(),
                q.reject_label.clone(),
                q.allow_notes,
                notes_placeholder,
            )
        } else {
            (
                "approval_decision".to_string(),
                fallback_label,
                String::new(),
                "Approve".to_string(),
                "Reject".to_string(),
                true,
                "Add notes about your decision (optional)".to_string(),
            )
        };

    DecisionUiConfig {
        mode: ApprovalRenderMode::Binary,
        question_id,
        label,
        description,
        approve_label,
        reject_label,
        allow_notes,
        notes_placeholder,
        allow_free_text: allow_notes,
        choice_options_json: "[]".to_string(),
        selected_option_id: String::new(),
    }
}

fn multiple_choice_config(question: &RadioSelectQuestion) -> DecisionUiConfig {
    let selected_option_id = default_selected_option_id(question);
    DecisionUiConfig {
        mode: ApprovalRenderMode::MultipleChoice,
        question_id: if question.id.trim().is_empty() {
            "approval_decision".to_string()
        } else {
            question.id.clone()
        },
        label: question.label.clone(),
        description: question.description.clone().unwrap_or_default(),
        approve_label: "Submit".to_string(),
        reject_label: "Cancel".to_string(),
        allow_notes: question.allow_free_text,
        notes_placeholder: question
            .free_text_placeholder
            .clone()
            .unwrap_or_else(|| "Optional context for your selection".to_string()),
        allow_free_text: question.allow_free_text,
        choice_options_json: serde_json::to_string(&question.options)
            .unwrap_or_else(|_| "[]".to_string()),
        selected_option_id,
    }
}

fn multi_session_config(
    request: &FormRequest,
    session_contract: Option<&ApprovalSessionContract>,
) -> Option<DecisionUiConfig> {
    let mut items = Vec::new();
    let mut approval_index = 0usize;

    for question in &request.questions {
        match question {
            Question::ConfirmReject(q) => {
                let question_id = if q.id.trim().is_empty() {
                    format!("approval_decision_{}", approval_index + 1)
                } else {
                    q.id.clone()
                };

                items.push(MultiSessionUiItem {
                    item_id: build_session_item_id(&question_id, session_contract, approval_index),
                    question_id,
                    mode: "binary".to_string(),
                    label: q.label.clone(),
                    description: q.description.clone().unwrap_or_default(),
                    approve_label: q.approve_label.clone(),
                    reject_label: q.reject_label.clone(),
                    allow_notes: q.allow_notes,
                    notes_placeholder: q
                        .notes_placeholder
                        .clone()
                        .unwrap_or_else(|| "Add notes about your decision (optional)".to_string()),
                    allow_free_text: q.allow_notes,
                    options: Vec::new(),
                    default_selected_option_id: String::new(),
                });
                approval_index += 1;
            }
            Question::RadioSelect(q) => {
                let question_id = if q.id.trim().is_empty() {
                    format!("approval_decision_{}", approval_index + 1)
                } else {
                    q.id.clone()
                };

                items.push(MultiSessionUiItem {
                    item_id: build_session_item_id(&question_id, session_contract, approval_index),
                    question_id,
                    mode: "multiple_choice".to_string(),
                    label: q.label.clone(),
                    description: q.description.clone().unwrap_or_default(),
                    approve_label: "Submit".to_string(),
                    reject_label: "Reject".to_string(),
                    allow_notes: q.allow_free_text,
                    notes_placeholder: q
                        .free_text_placeholder
                        .clone()
                        .unwrap_or_else(|| "Optional context for your selection".to_string()),
                    allow_free_text: q.allow_free_text,
                    options: q.options.clone(),
                    // Multi-session choices require an explicit user action before submit.
                    default_selected_option_id: String::new(),
                });
                approval_index += 1;
            }
            _ => {}
        }
    }

    if items.is_empty() {
        return None;
    }

    let session_id = session_contract
        .and_then(|session| {
            if session.session_id.trim().is_empty() {
                None
            } else {
                Some(session.session_id.clone())
            }
        })
        .unwrap_or_else(|| request.request_id.to_string());

    let require_all_responses = session_contract
        .map(|session| session.require_all_responses)
        .unwrap_or(false);

    let payload = MultiSessionUiPayload {
        multi_session: true,
        session_id,
        require_all_responses,
        items,
    };

    let choice_options_json = serde_json::to_string(&payload)
        .unwrap_or_else(|_| "{\"multi_session\":true,\"items\":[]}".to_string());

    let first_item = payload.items.first().cloned()?;

    Some(DecisionUiConfig {
        mode: if first_item.mode == "multiple_choice" {
            ApprovalRenderMode::MultipleChoice
        } else {
            ApprovalRenderMode::Binary
        },
        question_id: first_item.question_id,
        label: first_item.label,
        description: first_item.description,
        approve_label: first_item.approve_label,
        reject_label: first_item.reject_label,
        allow_notes: first_item.allow_notes,
        notes_placeholder: first_item.notes_placeholder,
        allow_free_text: first_item.allow_free_text,
        choice_options_json,
        selected_option_id: first_item.default_selected_option_id,
    })
}

fn build_session_item_id(
    question_id: &str,
    session_contract: Option<&ApprovalSessionContract>,
    approval_index: usize,
) -> String {
    if let Some(session) = session_contract {
        if let Some(item_id) = session.item_ids.get(approval_index) {
            if !item_id.trim().is_empty() {
                return item_id.clone();
            }
        }
    }

    if !question_id.trim().is_empty() {
        return question_id.to_string();
    }

    format!("item_{}", approval_index + 1)
}

fn default_selected_option_id(question: &RadioSelectQuestion) -> String {
    question
        .options
        .iter()
        .find(|option| option.recommended)
        .or_else(|| question.options.first())
        .map(|option| option.id.clone())
        .unwrap_or_default()
}

/// Spawn the countdown timer task that ticks once per second, updating
/// `remainingSeconds` on the Qt thread. On expiry, fires `timerExpired`
/// signal and auto-submits based on the on_timeout config.
async fn spawn_timer_task(
    qt_thread: cxx_qt::CxxQtThread<ffi::ApprovalApp>,
    state_arc: std::sync::Arc<std::sync::Mutex<crate::cxxqt_bridge::AppState>>,
    duration_seconds: u32,
) {
    use tokio::time::{interval, Duration};

    let mut remaining = duration_seconds;
    let mut tick = interval(Duration::from_secs(1));

    // Consume the first immediate tick.
    tick.tick().await;

    loop {
        tick.tick().await;

        // Check if paused.
        let paused = {
            let state = state_arc.lock().unwrap();
            state.timer_paused
        };

        if paused {
            continue;
        }

        remaining = remaining.saturating_sub(1);
        let r = remaining;

        let qt = qt_thread.clone();
        qt.queue(move |mut qobj| {
            qobj.as_mut().set_remaining_seconds(r as i32);
        })
        .unwrap();

        if remaining == 0 {
            // Timer expired — read on_timeout action and auto-submit.
            let on_timeout = {
                let state = state_arc.lock().unwrap();
                state.on_timeout_action.clone()
            };

            qt_thread
                .queue(move |mut qobj| {
                    match on_timeout.as_str() {
                        "approve" | "auto_fill" => {
                            if *qobj.as_ref().multiple_choice_mode() {
                                qobj.as_mut().submit_selection();
                            } else {
                                qobj.as_mut().approve();
                            }
                        }
                        "reject" | "defer" => qobj.as_mut().reject(),
                        _ => qobj.as_mut().reject(),
                    }
                    qobj.as_mut().timer_expired();
                })
                .unwrap();
            return;
        }
    }
}
