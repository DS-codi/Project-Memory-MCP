# Build Warning Investigation List

Source log: `copied_terminal_output-build_install.txt`
Build status: ✅ successful

## P0 — Investigate soon (possible packaging/runtime risk)

1. **windeployqt WebEngine dependency warnings (Interactive Terminal)**
   - Warning: `Cannot determine dependencies ... qtwebview_webengine.dll ... Qt6WebEngineQuick.dll not found`
   - Seen around lines: 180-181
   - Why it matters: if WebView features are ever used, runtime may fail due to missing WebEngine libs.
   - Suggested fix path:
     - If WebView is not needed: exclude webview plugin from deployment scan/config.
     - If needed: install/deploy Qt WebEngine component and ensure `Qt6WebEngineQuick.dll` is present in Qt bin.

2. **windeployqt shader/compiler warning (all Qt deploys)**
   - Warning: `Cannot find any version of the dxcompiler.dll and dxil.dll.`
   - Seen around lines: 51, 98, 138, 182
   - Why it matters: may impact some D3D shader paths on target machines.
   - Suggested fix path:
     - Bundle required DXC binaries, or install corresponding Windows/Qt prerequisites.
     - Add deploy-time check in install scripts and report actionable remediation.

3. **windeployqt Visual Studio env warning (all Qt deploys)**
   - Warning: `Cannot find Visual Studio installation directory, VCINSTALLDIR is not set.`
   - Seen around lines: 52, 99, 139, 183
   - Why it matters: currently non-fatal, but indicates incomplete toolchain env detection.
   - Suggested fix path:
     - Set `VCINSTALLDIR`/run from Developer PowerShell, or suppress via explicit deploy profile if verified safe.

## P1 — Code quality / maintainability warnings

4. **Interactive Terminal dead code warning**
   - Warning: `constant PTY_HOST_IPC_PORT is never used`
   - Seen around lines: 166-173
   - Suggested fix path: remove constant if obsolete, or wire it into pty-host feature path.

5. **Supervisor warnings (suppressed count: 8)**
   - Includes:
     - `unused_mut` (`let mut rx`)
     - `dead_code` (`kill_orphans_on_ports`, `find_pid_for_port`, `kill_pid`, `probe_http_health`)
     - `forgetting_copy_types` (`std::mem::forget(handle)`)
   - Seen around lines: 22-40, 46
   - Suggested fix path:
     - Clean obvious lint issues.
     - For intentionally unused functions, gate with feature flags or add targeted `#[allow(...)]` with reason.

6. **PM GUI binaries warnings (suppressed counts: 9 and 8)**
   - pm-approval-gui: unused imports, unused mut, dead_code field.
   - pm-brainstorm-gui: same warning classes.
   - Seen around lines: 69-93 and 111-133
   - Suggested fix path:
     - Remove stale imports and `mut`.
     - Confirm unused fields are planned; if not, remove.

## P2 — Frontend/packaging optimization warnings

7. **Dashboard bundle size warning**
   - Warning: chunk larger than 500 kB after minification (`assets/index-*.js ~668 kB`)
   - Seen around lines: 251-254
   - Suggested fix path:
     - Add route/component code splitting (`import()`)
     - Add `manualChunks` in Vite/Rollup for large vendor splits

8. **VS Code extension esbuild warnings from mocha internals**
   - Warning code: `require-resolve-not-external`
   - Paths referenced: `./reporters/parallel-buffered`, `./worker.js`
   - Seen around lines: 286-321 (appears in compile and prepublish)
   - Suggested fix path:
     - Mark specific mocha modules as external in esbuild config, or keep as known benign if packaged output is validated.

## Recommended next pass order

1. Resolve P0 deployment warnings (WebEngine + DXC + VCINSTALLDIR env consistency).
2. Fix easy Rust lint warnings in Interactive Terminal, Supervisor, and GUI binaries.
3. Address dashboard chunk-size split strategy.
4. Decide whether esbuild mocha warnings should be fixed or documented as accepted.

## Optional automation

- Add a post-build warning summarizer in `install.ps1` that parses logs and prints grouped warning counts by component.
- Add CI thresholds:
  - Fail on new P0 warnings
  - Allowlist known benign warnings with explicit comments.
