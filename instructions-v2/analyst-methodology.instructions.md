````instructions
---
applyTo: "agents/analyst.agent.md"
---

# Analyst Investigation Methodology

> **Source:** Extracted verbatim from `agents/analyst.agent.md` — this is the canonical location for these sections.

## 🔬 THE INVESTIGATION MODEL

Unlike the Coordinator's linear phase model, you operate in **exploration cycles**:

```
┌─────────────────────────────────────────────────────────────────┐
│                   INVESTIGATION CYCLE                            │
│                                                                  │
│    ┌──────────────┐                                              │
│    │  HYPOTHESIS  │ ← Form theory about what we're analyzing     │
│    └──────┬───────┘                                              │
│           ▼                                                      │
│    ┌──────────────┐                                              │
│    │  EXPERIMENT  │ ← Design test to validate/invalidate         │
│    └──────┬───────┘                                              │
│           ▼                                                      │
│    ┌──────────────┐                                              │
│    │   EXECUTE    │ ← Run the experiment (Executor subagent)     │
│    └──────┬───────┘                                              │
│           ▼                                                      │
│    ┌──────────────┐                                              │
│    │   ANALYZE    │ ← Interpret results                          │
│    └──────┬───────┘                                              │
│           ▼                                                      │
│    ┌──────────────┐                                              │
│    │   DOCUMENT   │ ← Record findings in knowledge base          │
│    └──────┬───────┘                                              │
│           │                                                      │
│           ├─── Hypothesis confirmed → Record as KNOWN            │
│           ├─── Hypothesis rejected → Form new hypothesis         │
│           └─── Partial insight → Refine and iterate              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cycle Categories

Your investigation steps fall into these categories (use when creating plan steps):

| Category | Purpose | Examples |
|----------|---------|----------|
| `hypothesis` | Form a theory to test | "Header bytes 0-4 may be magic number" |
| `experiment` | Design validation approach | "Create parser for suspected header format" |
| `analysis` | Interpret experiment results | "Compare output across sample files" |
| `discovery` | Document confirmed findings | "Confirmed: bytes 0-4 = version number" |
| `tool` | Create reusable analysis tools | "Build hex viewer with annotations" |
| `research` | External information gathering | "Research similar file format specs" |

---

## 📊 KNOWLEDGE BASE STRUCTURE

You maintain a **cumulative knowledge base** that persists across sessions.

### Storage Structure

```
plan_folder/
├── knowledge/
│   ├── confirmed.md          # Verified facts and structures
│   ├── hypotheses.md         # Current theories being tested
│   ├── rejected.md           # Disproven theories (and why)
│   ├── open_questions.md     # Unanswered questions
│   └── experiments/
│       ├── exp_001_header.md
│       ├── exp_002_payload.md
│       └── ...
├── tools/
│   ├── parser.py             # Analysis tools created
│   ├── hex_annotator.py
│   └── ...
├── samples/
│   ├── sample_001.bin        # Reference files
│   └── decoded/
└── research_notes/
    └── format_research.md
```

### Context Types for context (action: store)

| Type | Purpose |
|------|---------|
| `hypothesis` | Current theory being tested |
| `experiment_result` | Outcome of an experiment |
| `discovery` | Confirmed finding |
| `rejection` | Disproven theory with reasoning |
| `open_question` | Unresolved questions |
| `tool_created` | Analysis tool documentation |
| `sample_analysis` | Per-file analysis results |

---

## 🧪 EXPERIMENTATION WORKFLOW

### 1. Forming Hypotheses

Before testing, document your hypothesis:

```javascript
context (action: store) with
  workspace_id: "...",
  plan_id: "...",
  type: "hypothesis",
  data: {
    id: "H001",
    statement: "Bytes 0-4 contain a 32-bit little-endian version number",
    evidence_for: ["Pattern seen in 5 sample files", "Similar format uses this"],
    evidence_against: [],
    test_approach: "Parse first 4 bytes as uint32_le across all samples",
    status: "testing",
    created: "2026-02-02"
  }
```

### 2. Designing Experiments

Create a focused experiment to test the hypothesis:

```javascript
// Update step to experiment phase  
steps (action: update) with
  step_index: ...,
  status: "active",
  notes: "Experiment: Parse header as uint32_le"

// MANDATORY: Store research summary before spawning Executor
context (action: store) with
  workspace_id: "...",
  plan_id: "...",
  type: "research_summary",
  data: {
    findings: "Summary of what has been discovered so far",
    hypothesis: "Current hypothesis being tested",
    affected_files: ["list of files Executor needs to modify"],
    constraints: ["any constraints for implementation"],
    code_references: ["relevant patterns or snippets"]
  }

// Deploy Executor as SUBAGENT (you stay active!)
runSubagent({
  agentName: "Executor",
  prompt: `Plan: {plan_id}
Workspace: {workspace_id}

TASK: Implement experiment E001:
- Create a script that reads bytes 0-4 from sample files
- Parse as 32-bit little-endian unsigned integer
- Print results for each file
- Files are in: ./samples/

SCOPE BOUNDARIES (strictly enforced):
- ONLY modify/create files in: ./tools/, ./experiments/
- Do NOT modify existing source code or config files
- If your task requires changes beyond this scope, STOP and use
  memory_agent(action: handoff) to report back. Do NOT expand scope yourself.

CONTEXT RETRIEVAL (do this first):
- Call memory_context(action: get, type: "research_summary") for my findings
- Call memory_context(action: get, type: "hypothesis") for current theory
- Do NOT perform broad codebase research — context is provided.

You are a spoke agent. Do NOT call runSubagent to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the Analyst.`,
  description: "Implement header parsing experiment"
})

// When runSubagent returns, YOU analyze the results and continue
```

**CRITICAL: You stay active! The subagent does the work and reports back to YOU.**

### 3. Recording Results

After experiment completes:

```javascript
context (action: store) with
  type: "experiment_result",
  data: {
    hypothesis_id: "H001",
    experiment_id: "E001",
    result: "partial",
    observations: [
      "Values range from 1-5 across samples",
      "Correlates with file features (larger files = higher value)",
      "Exception: sample_007.bin has value 0"
    ],
    conclusion: "Likely version, but value 0 is unexpected",
    next_steps: ["Investigate sample_007 structure", "Check if 0 means unversioned"]
  }
```

### 4. Updating Knowledge Base

Use `memory_context` (action: append_research) to maintain the knowledge files:

```javascript
memory_context (action: append_research) with
  workspace_id: "...",
  plan_id: "...",
  filename: "confirmed.md",
  content: `
## Header Structure (bytes 0-7)

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | uint32_le | Version number (1-5, 0=legacy) |
| 4 | 4 | uint32_le | Payload length |

**Confirmed by:** Experiments E001, E003
**Date:** 2026-02-02
`
})
```

---

## 📝 ANALYSIS TECHNIQUES

### Binary Analysis Prompts

When analyzing binary files, use these approaches:

```markdown
## Reconnaissance Checklist
- [ ] File size distribution across samples
- [ ] First 64 bytes hex dump comparison
- [ ] Magic numbers / file signatures
- [ ] String extraction (`strings` command)
- [ ] Entropy analysis (compressed sections)
- [ ] Compare known good vs unknown

## Structure Discovery Checklist
- [ ] Fixed-size header identification
- [ ] Section/chunk boundaries
- [ ] Length fields (try different endianness)
- [ ] Offset/pointer fields
- [ ] Padding patterns
- [ ] Alignment requirements

## Pattern Recognition
- [ ] Repeating structures (arrays, records)
- [ ] Embedded formats (nested structures)
- [ ] Compression signatures (zlib, lz4, etc.)
- [ ] Encryption indicators (high entropy)
- [ ] Version markers
```

### Experiment Templates

```javascript
// Hypothesis test experiment
{
  type: "hypothesis_test",
  hypothesis_id: "H00X",
  approach: "Parse bytes X-Y as [type], compare across samples",
  success_criteria: "Values follow expected pattern in >80% of samples",
  tools_needed: ["hex_reader.py"],
  samples: ["sample_001.bin", "sample_002.bin", ...]
}

// Structure mapping experiment
{
  type: "structure_map",
  target_region: "bytes 0x100 - 0x200",
  approach: "Systematically test field interpretations",
  output: "Field map with types and meanings"
}

// Comparative analysis experiment
{
  type: "comparative",
  samples: ["minimal.bin", "complex.bin"],
  approach: "Diff hex dumps, identify variable vs fixed regions",
  output: "Annotated difference map"
}
```

````
