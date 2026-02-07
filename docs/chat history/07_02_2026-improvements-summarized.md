I have summarized all improvements and additions below.

1. **Agent & Plan Core (Backend)**

- Expanded Agent Support: Updated the server schema to officially support Analyst, Builder, Brainstorm, and Runner agent types.
- New "Investigation" Category: Implemented a specialized plan category for Analyst agents.
- Phase Template: Intake → Recon → Structure Discovery → Content Decoding → Hypothesis → Experiment → Validation → Resolution → Handoff.
- Enforcement: Validation logic now requires at least one goal and one success criterion for investigation plans.
- Consolidated Tools: Refined the logic for memory_workspace, memory_plan, memory_steps, and memory_agent to ensure consistent data handling across all interfaces.

2. **Dashboard Enhancements (Frontend & API)**

- Missing Data Surfaced: * Added visibility for step_type (e.g., analysis, implementation).
- Exposed assignee and requires_validation fields in the Step Editor.
- Displayed current_phase and plan categorization in the header.
- Template Engine: Added API endpoints and UI support to list and create plans from predefined templates.
- Context Management: Built a complete set of routes for storing and retrieving plan context, including initial requests and research notes.
- New Pages: Created dedicated dashboard views for:
- Context Files: A viewer for research and plan-specific context.
- Build Scripts: A standalone page to manage and run project scripts.
- Data Root: A system page displaying the current storage path.
- Workspace Status: A detailed view of health metrics and stale processes.

3. **VS Code Extension (Sidebar & Bridge)**

- MCP-to-HTTP Bridge: Updated the bridge to map consolidated MCP tool calls to the Dashboard's HTTP API, ensuring the VS Code Chat Participant can interact with the latest backend features.
- Sidebar Overhaul: * Tabbed Widgets: Consolidated Active and Archived plans into a single, tabbed interface.
- Activity Feed: Added a "Recent Activity" widget showing a live stream of handoffs, notes, and step updates.
- Collapsible Sections: All sidebar widgets (except Search) are now collapsible to save space.
- Size Awareness: Implemented a ResizeObserver to adapt the layout based on the sidebar's width.
- Icon System: * Extracted a full set of custom SVGs for lifecycle actions (Deploy, Configure, Deploy All).
- Inline SVGs: Moved all icons to inline HTML strings to bypass VS Code's strict Content Security Policy (CSP) and local pathing restrictions.
- Enhanced Search: Integrated a real input field in the sidebar that triggers the Dashboard’s global search modal with the user's query.
- Performance: Diagnosed and fixed a "flicker" issue by preventing full DOM re-renders during periodic health checks.

1. **Infrastructure & Documentation**

- Handoff Lineage: Added a dedicated endpoint to record "handoff" events, ensuring the agent lineage and "recommended next agent" data is updated correctly.
- Documentation: Updated project-memory-system.instructions.md and related files to reflect the new agent types, plan categories, and handoff protocols.
- Project Plan: Created docs/plans/sidebar-button-functionality-plan.md to track the implementation of remaining UI features.
