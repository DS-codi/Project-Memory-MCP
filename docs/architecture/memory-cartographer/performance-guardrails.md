# Performance Guardrails — memory_cartographer

## Purpose
Performance guardrails prevent unbounded resource consumption during cartography scans.
They define time and memory limits, sampling strategies, and the behaviour when budgets are exceeded.

## Time Budgets
| Threshold | Behaviour |
|-----------|-----------|
| 30 seconds (soft) | Emit `DiagnosticCode.TIMEOUT_PARTIAL`; continue if below hard limit |
| 120 seconds (hard) | Cancel scan; set `partial: true` in envelope; return partial result |

Cancellation is cooperative: Python core checks elapsed time at each batch boundary and after each schema section.

## Memory Budgets
| Threshold | Behaviour |
|-----------|-----------|
| 512 MB RSS | Emit warning diagnostic |
| 1024 MB RSS | Hard stop; set `partial: true`; return partial result |

Memory is checked at the start of each file batch.

## Progressive Sampling
When the file count exceeds **5,000**:
- Sort files by last-modified timestamp (descending)
- Include the top **20%** by recency
- Include all files matching high-priority patterns: `**/*.ts`, `**/*.py`, `**/*.rs`
- Remaining slots filled from the sorted remainder

## Batch Processing
| Parameter | Default | Range |
|-----------|---------|-------|
| batch_size | 500 files | 100–5,000 |
| max_batches | unlimited (until cap/timeout) | — |

## Degraded Mode
When a time or memory budget is exceeded:
1. Stop processing the current batch (do not discard already-processed data)
2. Set `partial: true` in the cartography envelope
3. Add a `DiagnosticCode.TIMEOUT_PARTIAL` or `DiagnosticCode.RESOURCE_LIMIT` diagnostic entry
4. Return the partial result immediately — do not raise an exception

## Cancellation Points
The engine checks for cancellation (timeout/OOM) at:
- Before each new file batch
- After completing each schema section (tables, columns, indexes, etc.)
- After completing each top-level cartography stage

## Reference Implementation
See `server/src/cartography/perf/metrics.ts` (TypeScript) and
`python-core/memory_cartographer/guardrails/perf_budget.py` (Python).
