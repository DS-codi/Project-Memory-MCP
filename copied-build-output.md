
=== Supervisor - QML Lint ===

=== Supervisor - Rust Build ===

=== SupervisorIced - Rust Build ===
warning: multiple fields are never read
--> supervisor-iced\src\backend\config.rs:54:9
warning: fields `restart_policy` and `pool` are never read
--> supervisor-iced\src\backend\config.rs:333:9
warning: field `restart_policy` is never read
--> supervisor-iced\src\backend\config.rs:372:9
warning: field `restart_policy` is never read
--> supervisor-iced\src\backend\config.rs:410:9
warning: field `restart_policy` is never read
--> supervisor-iced\src\backend\config.rs:444:9
warning: field `restart_policy` is never read
--> supervisor-iced\src\backend\config.rs:477:9
warning: variants `Ready`, `MissingCommand`, and `UnresolvedExecutablePath` are never constructed
--> supervisor-iced\src\backend\config.rs:593:5
warning: struct `CommandDiagnostic` is never constructed
--> supervisor-iced\src\backend\config.rs:600:12
warning: variants `Enabled`, `DisabledByConfig`, `MissingCommand`, and `UnresolvedExecutablePath` are never constructed
--> supervisor-iced\src\backend\config.rs:610:5
warning: struct `FormAppSummonabilityDiagnostic` is never constructed
--> supervisor-iced\src\backend\config.rs:618:12
warning: method `is_launchable` is never used
--> supervisor-iced\src\backend\config.rs:627:12
warning: function `diagnose_form_app_summonability` is never used
--> supervisor-iced\src\backend\config.rs:634:8
warning: function `diagnose_command` is never used
--> supervisor-iced\src\backend\config.rs:669:8
warning: function `resolve_command_path` is never used
--> supervisor-iced\src\backend\config.rs:704:4
warning: function `explicit_command_candidate` is never used
--> supervisor-iced\src\backend\config.rs:712:4
warning: function `resolve_command_on_path` is never used
--> supervisor-iced\src\backend\config.rs:723:4
warning: function `canonical_existing_file` is never used
--> supervisor-iced\src\backend\config.rs:751:4
warning: function `looks_like_explicit_path` is never used
--> supervisor-iced\src\backend\config.rs:759:4
warning: function `windows_pathexts` is never used
--> supervisor-iced\src\backend\config.rs:767:4
warning: fields `monitor_allowed_paths` and `monitor_url` are never read
--> supervisor-iced\src\backend\config.rs:873:9
warning: multiple fields are never read
--> supervisor-iced\src\backend\config.rs:997:9
warning: function `get_config_path` is never used
--> supervisor-iced\src\backend\config.rs:1082:8
warning: function `load` is never used
--> supervisor-iced\src\backend\config.rs:1092:8
warning: function `chatbot_state_path` is never used
--> supervisor-iced\src\backend\config.rs:1131:8
warning: function `load_chatbot_state` is never used
--> supervisor-iced\src\backend\config.rs:1140:8
warning: function `save_chatbot_state` is never used
--> supervisor-iced\src\backend\config.rs:1148:8
warning: field `data` is never read
--> supervisor-iced\src\backend\lock.rs:79:5
warning: methods `path`, `data_arc`, and `snapshot` are never used
--> supervisor-iced\src\backend\lock.rs:84:12
warning: struct `HeartbeatHandle` is never constructed
--> supervisor-iced\src\backend\lock.rs:111:12
warning: associated items `spawn` and `stop` are never used
--> supervisor-iced\src\backend\lock.rs:123:12
warning: function `acquire` is never used
--> supervisor-iced\src\backend\lock.rs:302:8
warning: function `init_tracing` is never used
--> supervisor-iced\src\backend\logging.rs:308:8
warning: variants `Running`, `Stopped`, `Starting`, and `Failed` are never constructed
--> supervisor-iced\src\backend\runner\mod.rs:22:5
warning: variants `Healthy` and `Unhealthy` are never constructed
--> supervisor-iced\src\backend\runner\mod.rs:40:5
warning: trait `ServiceRunner` is never used
--> supervisor-iced\src\backend\runner\mod.rs:62:11
warning: fields `initial_delay_ms`, `max_delay_ms`, `multiplier`, and `jitter_ratio` are never read
--> supervisor-iced\src\backend\runner\backoff.rs:15:9
warning: struct `BackoffState` is never constructed
--> supervisor-iced\src\backend\runner\backoff.rs:51:12
warning: associated items `new`, `from_config`, `next_delay_ms`, `reset`, and `attempts` are never used
--> supervisor-iced\src\backend\runner\backoff.rs:68:12
warning: function `init` is never used
--> supervisor-iced\src\backend\runner\job_object.rs:43:8
warning: function `adopt` is never used
--> supervisor-iced\src\backend\runner\job_object.rs:54:8
warning: static `JOB` is never used
--> supervisor-iced\src\backend\runner\job_object.rs:70:8
warning: function `init_windows` is never used
--> supervisor-iced\src\backend\runner\job_object.rs:73:4
warning: function `adopt_windows` is never used
--> supervisor-iced\src\backend\runner\job_object.rs:128:4
warning: variants `ChildLocal`, `DependencyGroup`, and `Global` are never constructed
--> supervisor-iced\src\backend\runner\state_machine.rs:36:5
warning: variants `Disconnected`, `Probing`, `Connecting`, `Verifying`, `Connected`, and `Reconnecting` are never constructed
--> supervisor-iced\src\backend\runner\state_machine.rs:49:5
warning: struct `ServiceStateMachine` is never constructed
--> supervisor-iced\src\backend\runner\state_machine.rs:74:12
warning: multiple associated items are never used
--> supervisor-iced\src\backend\runner\state_machine.rs:99:12
warning: struct `StoreInner` is never constructed
--> supervisor-iced\src\backend\runtime_output.rs:67:8
warning: associated items `new`, `push`, and `get_recent` are never used
--> supervisor-iced\src\backend\runtime_output.rs:78:8
warning: struct `RuntimeOutputStore` is never constructed
--> supervisor-iced\src\backend\runtime_output.rs:129:12
warning: multiple associated items are never used
--> supervisor-iced\src\backend\runtime_output.rs:136:12
warning: function `now_ms` is never used
--> supervisor-iced\src\backend\runtime_output.rs:315:4
warning: `supervisor-iced` (bin "supervisor-iced") generated 52 warnings

=== GuiForms - QML Lint ===

=== GuiForms - Rust Build ===

=== InteractiveTerminal - QML Lint ===

=== InteractiveTerminal - Build ===

=== Server - Build ===

=== Dashboard - Build ===

=== Extension - Build ===

=== Cartographer - Rust Build ===

=== GlobalClaude - Install ===