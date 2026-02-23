---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:44:56.256Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Frontend Dashboard Architecture

## Technology Stack
- **React** with TypeScript
- **Vite** for build tooling
- **React Router** for navigation
- **TanStack Query** for data fetching and caching
- **Tailwind CSS** for styling
- **Lucide React** for icons

## Directory Structure

### Key Directories
```
dashboard/src/
  pages/              # Route pages
  components/         # Reusable components
    common/          # Shared UI components
    plan/            # Plan-specific components
    workspace/       # Workspace components
    layout/          # Layout components
    timeline/        # Timeline/handoff visualization
  hooks/             # Custom React hooks
  api/               # API client
  store/             # State management (Zustand)
  types/             # TypeScript type definitions
```

## Plan Detail Page

### File: `dashboard/src/pages/PlanDetailPage.tsx`

Current tab structure:
```typescript
type Tab = 'timeline' | 'steps' | 'research' | 'activity';

const tabs = [
  { id: 'timeline', label: 'Timeline', icon: <GitBranch /> },
  { id: 'steps', label: 'Steps', icon: <ListChecks /> },
  { id: 'research', label: 'Research', icon: <FileText /> },
  { id: 'activity', label: 'Activity', icon: <Activity /> },
];
```

### Tab Implementation Pattern
```tsx
// 1. Add to Tab type union
type Tab = 'timeline' | 'steps' | 'research' | 'activity' | 'goals' | 'scripts';

// 2. Add to tabs array
const tabs = [
  // ... existing tabs
  { id: 'goals', label: 'Goals', icon: <Target /> },
  { id: 'scripts', label: 'Build Scripts', icon: <Terminal /> },
];

// 3. Add tab content in render
{activeTab === 'goals' && <GoalsTab plan={plan} />}
{activeTab === 'scripts' && <BuildScriptsTab workspaceId={workspaceId!} planId={planId!} />}
```

## Key Components for Reference

### Table Components
- `StepList.tsx` - Displays steps in table format with editable fields
- Located in: `dashboard/src/components/plan/StepList.tsx`
- Features: Inline editing, status badges, phase grouping

### Component Pattern
```tsx
export function BuildScriptsTable({ 
  workspaceId, 
  planId 
}: { 
  workspaceId: string; 
  planId: string; 
}) {
  const { data: scripts, isLoading } = useQuery({
    queryKey: ['build-scripts', workspaceId, planId],
    queryFn: () => fetchBuildScripts(workspaceId, planId),
  });

  return (
    <div className="space-y-4">
      {/* Table implementation */}
    </div>
  );
}
```

## API Integration

### File: `dashboard/src/api/vscode-bridge.ts`
- Handles communication with backend API
- Currently uses fetch for HTTP requests
- Base path: `/api/`

### Adding New Endpoints
```typescript
// In backend (server or dashboard server)
app.get('/api/build-scripts/:workspaceId/:planId', async (req, res) => {
  const { workspaceId, planId } = req.params;
  const scripts = await getBuildScripts(workspaceId, planId);
  res.json(scripts);
});

// In frontend hook
export function useBuildScripts(workspaceId: string, planId: string) {
  return useQuery({
    queryKey: ['build-scripts', workspaceId, planId],
    queryFn: async () => {
      const res = await fetch(`/api/build-scripts/${workspaceId}/${planId}`);
      if (!res.ok) throw new Error('Failed to fetch build scripts');
      return res.json();
    },
  });
}
```

## Shared Components

### Common Components (`dashboard/src/components/common/`)
- `Badge.tsx` - Status/category badges
- `ProgressBar.tsx` - Progress visualization
- `EmptyState.tsx` - Empty state placeholder
- `Toast.tsx` - Notification system

### Styling Utilities
- `cn()` from `utils/cn.ts` - Tailwind class merging
- `colors.ts` - Color scheme definitions for badges/status

## Build Scripts Tab Requirements

### New Components Needed:
1. **BuildScriptsTable.tsx** - Display scripts in table format
   - Columns: Name, Description, Directory, MCP Handle, Actions
   - Actions: Edit, Delete, Run (if MCP enabled)
   
2. **AddBuildScriptForm.tsx** - Form to add new scripts
   - Fields: name, description, directory, command, mcp_handle (optional)
   
3. **BuildScriptEditor.tsx** - Inline or modal editor for existing scripts

### Integration Point:
- Add tab to PlanDetailPage.tsx
- Create components in `dashboard/src/components/plan/`
- Create hook in `dashboard/src/hooks/useBuildScripts.ts`

## Goals/Success Criteria Tab

### Similar to Research Notes Tab
File: `dashboard/src/components/plan/ResearchNotesViewer.tsx`
- Displays markdown files from research_notes directory
- Uses file listing + markdown rendering

### Implementation Approach:
```tsx
export function GoalsTab({ plan }: { plan: PlanState }) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-semibold mb-2">Goals</h3>
        <ul className="list-disc list-inside space-y-1">
          {plan.goals?.map((goal, i) => (
            <li key={i}>{goal}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold mb-2">Success Criteria</h3>
        <ul className="list-disc list-inside space-y-1">
          {plan.success_criteria?.map((criterion, i) => (
            <li key={i}>{criterion}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

## Build Process

### package.json scripts:
```json
{
  "dev": "vite",                          // Dev server
  "build": "tsc && vite build",          // Production build
  "build:webview": "BUILD_TARGET=webview vite build",  // VS Code webview
  "server": "tsx watch server/src/index.ts",  // Backend server
  "dev:all": "concurrently \"npm run dev\" \"npm run server\""  // Full stack
}
```

### Build outputs:
- Standard build: `dashboard/dist/`
- Webview build: For embedding in VS Code extension panels
