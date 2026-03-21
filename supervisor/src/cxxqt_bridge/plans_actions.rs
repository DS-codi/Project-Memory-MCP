use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;
use crate::cxxqt_bridge::ffi;
use crate::cxxqt_bridge::initialize::TOKIO_HANDLE;

impl ffi::SupervisorGuiBridge {
    pub fn open_in_ide(self: Pin<&mut Self>, workspace_id: &QString) {
        let ws_id = workspace_id.to_string();
        let mcp_port = *self.mcp_port();

        let Some(handle) = TOKIO_HANDLE.get() else {
            eprintln!("[supervisor] open_in_ide: Tokio handle not available");
            return;
        };

        handle.spawn(async move {
            let client = reqwest::Client::new();
            let url = format!("http://127.0.0.1:{}/admin/workspaces", mcp_port);

            if let Ok(resp) = client.get(&url).send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(workspaces) = json["workspaces"].as_array() {
                        if let Some(ws) = workspaces.iter().find(|w| w["id"] == ws_id) {
                            if let Some(path) = ws["path"].as_str() {
                                let mut cmd = std::process::Command::new("cmd");
                                cmd.args(["/C", "code", path]);
                                #[cfg(windows)]
                                {
                                    use std::os::windows::process::CommandExt;
                                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                                    cmd.creation_flags(CREATE_NO_WINDOW);
                                }
                                let _ = cmd.spawn();
                            }
                        }
                    }
                }
            }
        });
    }

    pub fn backup_workspace_plans(mut self: Pin<&mut Self>, workspace_id: &QString, output_dir: &QString) {
        let ws_id = workspace_id.to_string();
        let out_dir = output_dir.to_string();
        let mcp_port = *self.mcp_port();
        let qt_thread = self.qt_thread();

        let Some(handle) = TOKIO_HANDLE.get() else {
            eprintln!("[supervisor] backup_workspace_plans: Tokio handle not available");
            return;
        };

        handle.spawn(async move {
            let client = reqwest::Client::new();
            let list_url = format!("http://127.0.0.1:{}/admin/plans?workspace_id={}&status=all", mcp_port, ws_id);

            if let Ok(resp) = client.get(&list_url).send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(plans) = json["plans"].as_array() {
                        let mut count = 0;
                        for plan in plans {
                            if let Some(plan_id) = plan["id"].as_str() {
                                let get_url = format!("http://127.0.0.1:{}/admin/plans?workspace_id={}&plan_id={}", mcp_port, ws_id, plan_id);
                                if let Ok(get_resp) = client.get(&get_url).send().await {
                                    if let Ok(plan_data) = get_resp.json::<serde_json::Value>().await {
                                        let file_path = std::path::PathBuf::from(&out_dir).join(format!("{}.json", plan_id));
                                        if let Ok(content) = serde_json::to_string_pretty(&plan_data) {
                                            if std::fs::write(file_path, content).is_ok() {
                                                count += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let msg = format!("Backed up {} plans to {}", count, out_dir);
                        qt_thread.queue(move |mut app| {
                            app.as_mut().set_action_feedback(QString::from(&msg));
                        }).ok();
                    }
                }
            }
        });
    }

    pub fn create_plan_from_prompt(mut self: Pin<&mut Self>, prompt: &QString, workspace_id: &QString) {
        let p = prompt.to_string();
        let ws_id = workspace_id.to_string();
        
        // The user wants a "hidden cli agent session".
        // We can spawn the gemini-cli with a specific prompt.
        
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", &format!("gemini-cli --workspace {} --prompt '{}' --role Brainstorm", ws_id, p.replace("'", "''"))]);
        
        // Run in background, hidden.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        match cmd.spawn() {
            Ok(_) => {
                self.as_mut().set_action_feedback(QString::from("Brainstorming session started in background."));
            }
            Err(e) => {
                self.as_mut().set_action_feedback(QString::from(&format!("Failed to launch agent: {}", e)));
            }
        }
    }

    pub fn register_workspace(mut self: Pin<&mut Self>, path: &QString) {
        let p = path.to_string();
        let mcp_port = *self.mcp_port();
        let qt_thread = self.qt_thread();

        let Some(handle) = TOKIO_HANDLE.get() else {
            eprintln!("[supervisor] register_workspace: Tokio handle not available");
            return;
        };

        handle.spawn(async move {
            let client = reqwest::Client::new();
            let url = format!("http://127.0.0.1:{}/admin/workspaces", mcp_port);
            
            let body = serde_json::json!({
                "action": "register",
                "workspace_path": p
            });
            
            match client.post(&url).json(&body).send().await {
                Ok(resp) if resp.status().is_success() => {
                    qt_thread.queue(move |mut app| {
                        app.as_mut().set_action_feedback(QString::from("Workspace registered successfully."));
                    }).ok();
                }
                Ok(resp) => {
                    let err = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                    qt_thread.queue(move |mut app| {
                        app.as_mut().set_action_feedback(QString::from(&format!("Registration failed: {}", err)));
                    }).ok();
                }
                Err(e) => {
                    qt_thread.queue(move |mut app| {
                        app.as_mut().set_action_feedback(QString::from(&format!("Request failed: {}", e)));
                    }).ok();
                }
            }
        });
    }
}
