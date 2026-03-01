# Gemini CLI Reference Guide

The Gemini CLI (`@google/gemini-cli`) offers extensive flexibility through launch arguments, contextual files, and customizable appearance settings. This guide outlines how to tailor the CLI to your specific workflow and visual preferences.

## 1. Launch Arguments and Flags

Control the session context, model, and behavior directly from your terminal when launching the CLI:

### Model & Prompting
* **`-m, --model <model>`**: Specify the AI model to use (e.g., `gemini-1.5-pro`, `gemini-2.5-flash`).
* **`<prompt>`**: Passing a string as a positional argument runs a **one-off query** and immediately exits (non-interactive mode).
* **`-i, --prompt-interactive <prompt>`**: Starts an interactive session but uses the provided prompt as your first message.
* **`-p, --prompt <prompt>`**: Pass a prompt directly (Legacy/Alternative).

### Session Management
* **`-r, --resume <latest | ID>`**: Resumes your most recent session or a specific session using its ID.
* **`--list-sessions`**: Displays a history of your previous sessions and their IDs.

### System & Output Behavior
* **`-o, --output-format <text | json | stream-json>`**: Changes the output format. `json` is highly useful for piping the AI's response into other command-line tools like `jq`.
* **`-d, --debug`**: Enables verbose logging for troubleshooting API requests and tool calls.
* **`--yolo`** (or `--approval-mode=yolo`): Automatically approves all tool calls without prompting the user (use with extreme caution).

---

## 2. Contextual Awareness

The CLI is designed to automatically understand your environment without requiring constant manual input:

* **`GEMINI.md` Files**: The CLI automatically searches for `GEMINI.md` files in your current and parent directories. It treats the contents of these files as "system instructions" or project-specific memory, grounding the AI in your codebase's specific context.
* **Environment Variables**: Use `GEMINI_API_KEY` or `GOOGLE_CLOUD_PROJECT` to handle authentication seamlessly in the background.

---

## 3. Options for a Basic / Minimalist Appearance

If the default user interface is too busy, or if you are using a screen reader, you can strip down the interface for a cleaner experience:

### Accessibility / Screen Reader Mode
For the most basic, plain-text appearance, launch the CLI with:
`gemini --screen-reader`
This disables complex terminal UI elements like spinners, ASCII boxes, and heavy formatting, making the output highly accessible and visually simple.

### In-App Customization (`/settings`)
Once inside an interactive CLI session, type `/settings` to open the configuration menu. You can toggle several options to clean up the interface:
* **Hide Header/Footer**: Set `ui.hideBanner` and `ui.hideFooter` to `true`.
* **Disable Tips**: Set `ui.hideTips` to `true` to remove suggestions above the input bar.
* **Minimalist Loading**: Set `ui.loadingPhrases` to `none` to disable witty loading text.
* **Monochrome**: Set `ui.useBackgroundColor` to `false` for a standard, uncolored terminal look.

### The "Silent" Method (Scripting)
If you want **zero UI**, use the non-interactive mode. This is perfect for bash scripts where you only want the raw text output:
`gemini "Summarize the files in this directory" > summary.txt`
