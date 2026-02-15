"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/test/replay/cli/replay-cli.ts
var fs7 = __toESM(require("fs/promises"));
var path9 = __toESM(require("path"));

// src/test/replay/core/Comparator.ts
var EXPLAINABILITY_TAXONOMY_ORDER = [
  "flow_protocol",
  "authorization_policy",
  "tool_sequence",
  "success_signature",
  "artifact_integrity"
];
var CATEGORY_BY_CHECK_TYPE = {
  tool_order: "tool_sequence",
  auth_outcome: "authorization_policy",
  flow: "flow_protocol",
  success_signature: "success_signature"
};
function inferCategoryFromText(checkId, message) {
  const token = `${checkId ?? ""} ${message}`.toLowerCase();
  if (token.includes("scenario-presence") || token.includes("artifact")) {
    return "artifact_integrity";
  }
  if (token.includes("auth")) {
    return "authorization_policy";
  }
  if (token.includes("tool") || token.includes("order") || token.includes("sequence")) {
    return "tool_sequence";
  }
  if (token.includes("handoff") || token.includes("complete") || token.includes("confirmation") || token.includes("flow")) {
    return "flow_protocol";
  }
  if (token.includes("signature")) {
    return "success_signature";
  }
  return "artifact_integrity";
}
function deriveDriftCategory(check, drift) {
  if (check) {
    return CATEGORY_BY_CHECK_TYPE[check.type];
  }
  return inferCategoryFromText(drift.check_id, drift.message);
}
function deriveConfidenceBand(drift) {
  const detailCount = drift.details ? Object.keys(drift.details).length : 0;
  if (drift.severity === "high") {
    return detailCount > 0 ? "high" : "medium";
  }
  if (drift.severity === "medium") {
    return detailCount >= 2 ? "high" : detailCount > 0 ? "medium" : "low";
  }
  return detailCount >= 2 ? "medium" : "low";
}
function deriveOperatorBucket(drift) {
  if (drift.severity === "high") {
    return "blocker";
  }
  if (drift.severity === "medium") {
    return "actionable";
  }
  return "monitor";
}
function remediationForCategory(category, drift) {
  if (category === "tool_sequence") {
    return {
      likely_causes: ["Planner selected a different tool/action sequence than baseline."],
      recommended_actions: ["Compare baseline/candidate tool-action order and align decision flow."],
      verification_steps: ["Re-run replay and confirm tool-order drift no longer appears."]
    };
  }
  if (category === "authorization_policy") {
    return {
      likely_causes: ["Authorization policy outcome or reason-class changed."],
      recommended_actions: ["Inspect authorization rationale and policy envelopes for parity."],
      verification_steps: ["Validate auth events and reason_class values match baseline expectations."]
    };
  }
  if (category === "flow_protocol") {
    return {
      likely_causes: ["Required sequencing (confirmation/handoff/complete) was violated."],
      recommended_actions: ["Restore protocol ordering before gated updates and completion."],
      verification_steps: ["Replay scenario and verify protocol event ordering checks pass."]
    };
  }
  if (category === "success_signature") {
    return {
      likely_causes: ["Expected success signature tokens were missing from candidate run."],
      recommended_actions: ["Restore missing success-signature emitting path."],
      verification_steps: ["Confirm must_include signatures are present in normalized candidate events."]
    };
  }
  return {
    likely_causes: ["Required replay artifacts were missing or could not be resolved."],
    recommended_actions: ["Rebuild baseline/candidate artifacts and verify scenario coverage parity."],
    verification_steps: [`Confirm artifacts exist for scenario ${drift.scenario_id} and rerun comparison.`]
  };
}
function findActionIndexes(events, actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return void 0;
  }
  const expected = new Set(actions.map((action) => action.trim().toLowerCase()));
  const indexes = [];
  events.forEach((event, index) => {
    const action = (event.action_canonical ?? event.action_raw ?? "").trim().toLowerCase();
    if (expected.has(action)) {
      indexes.push(index);
    }
  });
  return indexes.length > 0 ? indexes : void 0;
}
function normalizeEvidenceRef(value) {
  return value.trim().replace(/\\/g, "/");
}
function toScenarioArtifactRef(profile, scenarioId) {
  return normalizeEvidenceRef(`${profile}.norm.json#scenario:${scenarioId}`);
}
function buildEvidence(drift, baselineArtifact, candidateArtifact) {
  const details = drift.details ?? {};
  const baselineEventIndexes = Array.isArray(details.baseline_event_indexes) ? details.baseline_event_indexes : findActionIndexes(baselineArtifact.normalized_events, details.baseline_actions);
  const candidateEventIndexes = Array.isArray(details.candidate_event_indexes) ? details.candidate_event_indexes : findActionIndexes(candidateArtifact.normalized_events, details.candidate_actions);
  const fingerprint = [drift.scenario_id, drift.check_id, drift.severity, drift.message.trim().toLowerCase()].join("|");
  return {
    baseline_event_indexes: baselineEventIndexes,
    candidate_event_indexes: candidateEventIndexes,
    artifact_refs: [
      toScenarioArtifactRef(baselineArtifact.profile, drift.scenario_id),
      toScenarioArtifactRef(candidateArtifact.profile, drift.scenario_id)
    ],
    fingerprint
  };
}
function enrichDrift(drift, check, baselineArtifact, candidateArtifact) {
  const category = deriveDriftCategory(check, drift);
  return {
    ...drift,
    category,
    confidence: deriveConfidenceBand(drift),
    operator_bucket: deriveOperatorBucket(drift),
    remediation: remediationForCategory(category, drift),
    evidence: buildEvidence(drift, baselineArtifact, candidateArtifact)
  };
}
function buildExplainabilityGroups(drifts) {
  if (drifts.length === 0) {
    return void 0;
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const drift of drifts) {
    if (!drift.category) {
      continue;
    }
    const current = grouped.get(drift.category) ?? {
      category: drift.category,
      total_drifts: 0,
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      blocker_bucket: 0,
      actionable_bucket: 0,
      monitor_bucket: 0
    };
    current.total_drifts += 1;
    if (drift.confidence === "high") {
      current.high_confidence = (current.high_confidence ?? 0) + 1;
    } else if (drift.confidence === "medium") {
      current.medium_confidence = (current.medium_confidence ?? 0) + 1;
    } else if (drift.confidence === "low") {
      current.low_confidence = (current.low_confidence ?? 0) + 1;
    }
    if (drift.operator_bucket === "blocker") {
      current.blocker_bucket = (current.blocker_bucket ?? 0) + 1;
    } else if (drift.operator_bucket === "actionable") {
      current.actionable_bucket = (current.actionable_bucket ?? 0) + 1;
    } else if (drift.operator_bucket === "monitor") {
      current.monitor_bucket = (current.monitor_bucket ?? 0) + 1;
    }
    grouped.set(drift.category, current);
  }
  return EXPLAINABILITY_TAXONOMY_ORDER.filter((category) => grouped.has(category)).map((category) => grouped.get(category));
}
function buildExplainabilityRollup(drifts) {
  const explained = drifts.filter((drift) => drift.category || drift.confidence || drift.operator_bucket);
  if (explained.length === 0) {
    return void 0;
  }
  const byCategory = {};
  const byConfidence = {};
  const byOperatorBucket = {};
  for (const drift of explained) {
    if (drift.category) {
      byCategory[drift.category] = (byCategory[drift.category] ?? 0) + 1;
    }
    if (drift.confidence) {
      byConfidence[drift.confidence] = (byConfidence[drift.confidence] ?? 0) + 1;
    }
    if (drift.operator_bucket) {
      byOperatorBucket[drift.operator_bucket] = (byOperatorBucket[drift.operator_bucket] ?? 0) + 1;
    }
  }
  return {
    total_explained_drifts: explained.length,
    by_category: byCategory,
    by_confidence: byConfidence,
    by_operator_bucket: byOperatorBucket
  };
}
function normalizeComparatorProfile(profile) {
  return {
    profile_name: profile.profile_name ?? "default-replay-profile",
    tool_order: {
      strict_default: profile.tool_order?.strict_default ?? true,
      ignore_optional_tools: Array.isArray(profile.tool_order?.ignore_optional_tools) ? profile.tool_order.ignore_optional_tools : []
    },
    authorization: {
      compare_reason_class: profile.authorization?.compare_reason_class ?? true
    },
    flow: {
      require_handoff_before_complete: profile.flow?.require_handoff_before_complete ?? true,
      require_confirmation_before_gated_updates: profile.flow?.require_confirmation_before_gated_updates ?? true,
      required_handoff_target: profile.flow?.required_handoff_target ?? "Coordinator"
    },
    success_signatures: {
      require_all: profile.success_signatures?.require_all ?? true
    }
  };
}
function getToolActions(events, profile) {
  const ignoredTools = new Set(profile.tool_order.ignore_optional_tools.map((tool) => tool.trim().toLowerCase()));
  return events.filter((event) => event.event_type === "tool_call").map((event) => ({
    tool: (event.tool_name ?? "unknown").trim().toLowerCase(),
    action: (event.action_canonical ?? event.action_raw ?? "unknown").trim().toLowerCase()
  })).filter((entry) => !ignoredTools.has(entry.tool));
}
function hasSubsequenceInOrder(source, target) {
  if (source.length === 0) {
    return true;
  }
  let sourceIndex = 0;
  for (const value of target) {
    if (value === source[sourceIndex]) {
      sourceIndex += 1;
      if (sourceIndex === source.length) {
        return true;
      }
    }
  }
  return false;
}
function compareToolOrder(scenario, baseline, candidate, check, profile) {
  const baselineToolActions = getToolActions(baseline, profile);
  const candidateToolActions = getToolActions(candidate, profile);
  const baselineActions = baselineToolActions.map((entry) => entry.action);
  const candidateActions = candidateToolActions.map((entry) => entry.action);
  const strictOrder = typeof check.strict_order === "boolean" ? check.strict_order : profile.tool_order.strict_default;
  if (strictOrder && baselineActions.join(">") !== candidateActions.join(">")) {
    return [
      {
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: "Tool call order drift detected under strict ordering.",
        details: {
          baseline_actions: baselineActions,
          candidate_actions: candidateActions
        }
      }
    ];
  }
  if (!strictOrder && !hasSubsequenceInOrder(baselineActions, candidateActions)) {
    return [
      {
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: "Tool call sequence drift detected (candidate does not preserve baseline action order).",
        details: {
          baseline_actions: baselineActions,
          candidate_actions: candidateActions
        }
      }
    ];
  }
  for (const action of baselineActions) {
    if (!candidateActions.includes(action)) {
      return [
        {
          scenario_id: scenario.scenario_id,
          check_id: check.id,
          severity: check.severity,
          message: `Candidate trace is missing required tool action '${action}'.`,
          details: {
            baseline_actions: baselineActions,
            candidate_actions: candidateActions
          }
        }
      ];
    }
  }
  const baselineActionCounts = /* @__PURE__ */ new Map();
  for (const action of baselineActions) {
    baselineActionCounts.set(action, (baselineActionCounts.get(action) ?? 0) + 1);
  }
  const candidateActionCounts = /* @__PURE__ */ new Map();
  for (const action of candidateActions) {
    candidateActionCounts.set(action, (candidateActionCounts.get(action) ?? 0) + 1);
  }
  const unexpectedExtras = Array.from(candidateActionCounts.entries()).filter(([action, count]) => count > (baselineActionCounts.get(action) ?? 0)).map(([action]) => action);
  if (unexpectedExtras.length > 0) {
    return [
      {
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: `Candidate trace contains unexpected extra tool actions: ${unexpectedExtras.join(", ")}.`,
        details: {
          baseline_actions: baselineActions,
          candidate_actions: candidateActions,
          unexpected_actions: unexpectedExtras
        }
      }
    ];
  }
  return [];
}
function compareAuthorization(scenario, baseline, candidate, check, profile) {
  const normalizeAuth = (events) => events.filter((event) => event.authorization).map((event) => ({
    action: event.action_canonical ?? event.action_raw ?? event.event_type,
    outcome: event.authorization?.outcome,
    reason_class: event.authorization?.reason_class
  }));
  const baselineAuth = normalizeAuth(baseline);
  const candidateAuth = normalizeAuth(candidate);
  const drifts = [];
  for (let index = 0; index < Math.min(baselineAuth.length, candidateAuth.length); index += 1) {
    const b = baselineAuth[index];
    const c = candidateAuth[index];
    if (b.outcome !== c.outcome) {
      drifts.push({
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: `Authorization outcome drift at index ${index}.`,
        details: {
          baseline: b,
          candidate: c
        }
      });
    }
    if (profile.authorization.compare_reason_class && b.reason_class !== c.reason_class) {
      drifts.push({
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: `Authorization reason-class drift at index ${index}.`,
        details: {
          baseline: b,
          candidate: c
        }
      });
    }
  }
  if (baselineAuth.length !== candidateAuth.length) {
    drifts.push({
      scenario_id: scenario.scenario_id,
      check_id: check.id,
      severity: check.severity,
      message: "Authorization event count drift detected.",
      details: {
        baseline_count: baselineAuth.length,
        candidate_count: candidateAuth.length
      }
    });
  }
  return drifts;
}
function hasOrderedEvents(events, requiredSequence) {
  let cursor = 0;
  for (const event of events) {
    if (event.event_type === requiredSequence[cursor]) {
      cursor += 1;
      if (cursor === requiredSequence.length) {
        return true;
      }
    }
  }
  return requiredSequence.length === 0;
}
function compareFlow(scenario, candidate, check, profile) {
  const drifts = [];
  if (profile.flow.require_handoff_before_complete) {
    const hasCompleteEvent = candidate.some((event) => event.event_type === "complete");
    const flowOkay = hasOrderedEvents(candidate, ["handoff", "complete"]);
    if (hasCompleteEvent && !flowOkay) {
      drifts.push({
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: check.severity,
        message: "Expected handoff event before complete event was not observed."
      });
    }
  }
  if (profile.flow.require_confirmation_before_gated_updates) {
    const updates = candidate.filter((event) => event.event_type === "plan_step_update");
    const confirmations = candidate.filter((event) => event.event_type === "confirmation");
    if (updates.length > 0 && confirmations.length === 0) {
      drifts.push({
        scenario_id: scenario.scenario_id,
        check_id: check.id,
        severity: "medium",
        message: "Plan step updates occurred without a confirmation event."
      });
    }
  }
  const handoffTarget = profile.flow.required_handoff_target;
  const invalidHandoff = candidate.find(
    (event) => event.event_type === "handoff" && event.payload?.to_agent !== handoffTarget
  );
  if (invalidHandoff) {
    drifts.push({
      scenario_id: scenario.scenario_id,
      check_id: check.id,
      severity: check.severity,
      message: `Unexpected handoff target '${String(invalidHandoff.payload?.to_agent)}'; expected '${handoffTarget}'.`,
      details: {
        observed_target: invalidHandoff.payload?.to_agent,
        expected_target: handoffTarget
      }
    });
  }
  return drifts;
}
function compareSuccessSignatures(scenario, candidate, check, profile) {
  const observed = new Set(
    candidate.map((event) => event.success_signature).filter((signature) => typeof signature === "string" && signature.length > 0)
  );
  const requiredSignatures = scenario.expectations.success_signature.must_include;
  const missing = requiredSignatures.filter((signature) => !observed.has(signature));
  if (missing.length === 0) {
    return [];
  }
  return [
    {
      scenario_id: scenario.scenario_id,
      check_id: check.id,
      severity: check.severity,
      message: `Missing required success signatures: ${missing.join(", ")}`,
      details: {
        required: requiredSignatures,
        observed: Array.from(observed)
      }
    }
  ];
}
function compareAcceptanceThresholds(scenario, drifts) {
  const thresholds = scenario.acceptance_thresholds;
  if (!thresholds) {
    return [];
  }
  const thresholdDrifts = [];
  const high = drifts.filter((drift) => drift.severity === "high").length;
  const medium = drifts.filter((drift) => drift.severity === "medium").length;
  const low = drifts.filter((drift) => drift.severity === "low").length;
  const total = drifts.length;
  if (typeof thresholds.max_total_drifts === "number" && total > thresholds.max_total_drifts) {
    thresholdDrifts.push({
      scenario_id: scenario.scenario_id,
      check_id: "drift-threshold-total",
      severity: "high",
      message: `Scenario exceeded max_total_drifts threshold (${total} > ${thresholds.max_total_drifts}).`,
      details: {
        observed_total: total,
        threshold: thresholds.max_total_drifts
      }
    });
  }
  if (typeof thresholds.max_high_severity_drifts === "number" && high > thresholds.max_high_severity_drifts) {
    thresholdDrifts.push({
      scenario_id: scenario.scenario_id,
      check_id: "drift-threshold-high",
      severity: "high",
      message: `Scenario exceeded max_high_severity_drifts threshold (${high} > ${thresholds.max_high_severity_drifts}).`,
      details: {
        observed_high: high,
        threshold: thresholds.max_high_severity_drifts
      }
    });
  }
  if (typeof thresholds.max_medium_severity_drifts === "number" && medium > thresholds.max_medium_severity_drifts) {
    thresholdDrifts.push({
      scenario_id: scenario.scenario_id,
      check_id: "drift-threshold-medium",
      severity: "medium",
      message: `Scenario exceeded max_medium_severity_drifts threshold (${medium} > ${thresholds.max_medium_severity_drifts}).`,
      details: {
        observed_medium: medium,
        threshold: thresholds.max_medium_severity_drifts
      }
    });
  }
  if (typeof thresholds.max_low_severity_drifts === "number" && low > thresholds.max_low_severity_drifts) {
    thresholdDrifts.push({
      scenario_id: scenario.scenario_id,
      check_id: "drift-threshold-low",
      severity: "low",
      message: `Scenario exceeded max_low_severity_drifts threshold (${low} > ${thresholds.max_low_severity_drifts}).`,
      details: {
        observed_low: low,
        threshold: thresholds.max_low_severity_drifts
      }
    });
  }
  return thresholdDrifts;
}
function compareScenario(scenario, baselineArtifact, candidateArtifact, profile) {
  const drifts = [];
  const checks = scenario.expectations.checks;
  for (const check of checks) {
    if (check.type === "tool_order") {
      drifts.push(
        ...compareToolOrder(
          scenario,
          baselineArtifact.normalized_events,
          candidateArtifact.normalized_events,
          check,
          profile
        )
      );
      continue;
    }
    if (check.type === "auth_outcome") {
      drifts.push(
        ...compareAuthorization(
          scenario,
          baselineArtifact.normalized_events,
          candidateArtifact.normalized_events,
          check,
          profile
        )
      );
      continue;
    }
    if (check.type === "flow") {
      drifts.push(...compareFlow(scenario, candidateArtifact.normalized_events, check, profile));
      continue;
    }
    if (check.type === "success_signature") {
      drifts.push(...compareSuccessSignatures(scenario, candidateArtifact.normalized_events, check, profile));
    }
  }
  const enrichedDrifts = drifts.map((drift) => {
    const matchingCheck = checks.find((check) => check.id === drift.check_id);
    return enrichDrift(drift, matchingCheck, baselineArtifact, candidateArtifact);
  });
  const thresholdDrifts = compareAcceptanceThresholds(scenario, enrichedDrifts).map(
    (drift) => enrichDrift(drift, void 0, baselineArtifact, candidateArtifact)
  );
  const allDrifts = [...enrichedDrifts, ...thresholdDrifts];
  return {
    scenario_id: scenario.scenario_id,
    passed: allDrifts.length === 0,
    drifts: allDrifts,
    checks_executed: checks.map((check) => check.id),
    explainability_groups: buildExplainabilityGroups(allDrifts)
  };
}
function compareReplayRuns(suite, baselineArtifacts, candidateArtifacts, profile) {
  const resolvedProfile = normalizeComparatorProfile(profile);
  const baselineByScenario = new Map(
    baselineArtifacts.scenarios.map((artifact) => [artifact.scenario_id, artifact])
  );
  const candidateByScenario = new Map(
    candidateArtifacts.scenarios.map((artifact) => [artifact.scenario_id, artifact])
  );
  const scenarioComparisons = [];
  for (const scenario of suite) {
    const baseline = baselineByScenario.get(scenario.scenario_id);
    const candidate = candidateByScenario.get(scenario.scenario_id);
    if (!baseline || !candidate) {
      scenarioComparisons.push({
        scenario_id: scenario.scenario_id,
        passed: false,
        checks_executed: [],
        drifts: [
          {
            scenario_id: scenario.scenario_id,
            check_id: "scenario-presence",
            severity: "high",
            message: "Baseline or candidate artifacts are missing for this scenario.",
            details: {
              baseline_found: Boolean(baseline),
              candidate_found: Boolean(candidate)
            }
          }
        ]
      });
      continue;
    }
    scenarioComparisons.push(compareScenario(scenario, baseline, candidate, resolvedProfile));
  }
  const allDrifts = scenarioComparisons.flatMap((scenario) => scenario.drifts);
  const summary = {
    total_scenarios: scenarioComparisons.length,
    passed_scenarios: scenarioComparisons.filter((scenario) => scenario.passed).length,
    failed_scenarios: scenarioComparisons.filter((scenario) => !scenario.passed).length,
    high_severity_drifts: allDrifts.filter((drift) => drift.severity === "high").length,
    medium_severity_drifts: allDrifts.filter((drift) => drift.severity === "medium").length,
    low_severity_drifts: allDrifts.filter((drift) => drift.severity === "low").length,
    explainability_rollup: buildExplainabilityRollup(allDrifts)
  };
  return {
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    profile_name: resolvedProfile.profile_name,
    passed: summary.failed_scenarios === 0 && summary.high_severity_drifts === 0,
    scenarios: scenarioComparisons,
    summary
  };
}

// src/test/replay/core/BaselinePromotion.ts
var fs2 = __toESM(require("fs/promises"));
var path3 = __toESM(require("path"));

// src/test/replay/core/GoldenBaselineStore.ts
var fs = __toESM(require("fs/promises"));
var path2 = __toESM(require("path"));

// src/test/replay/core/StableJson.ts
var path = __toESM(require("path"));
function normalizeManifestPath(value) {
  return value.replace(/\\/g, "/");
}
function normalizeObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeObject(entry));
  }
  if (value && typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
    const normalizedEntries = keys.map((key) => [key, normalizeObject(record[key])]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}
function stableStringify(value) {
  return JSON.stringify(normalizeObject(value), null, 2);
}
function toWorkspaceRelativePath(filePath, workspacePath) {
  const base = workspacePath ? path.resolve(workspacePath) : process.cwd();
  const absolute = path.resolve(filePath);
  const relative2 = path.relative(base, absolute);
  if (relative2.length === 0) {
    return ".";
  }
  if (relative2.startsWith("..")) {
    return normalizeManifestPath(absolute);
  }
  return normalizeManifestPath(relative2);
}

// src/test/replay/core/GoldenBaselineStore.ts
var GOLDEN_METADATA_SCHEMA_V1 = "replay-golden-baseline-metadata.v1";
function sanitizeBaselineId(value) {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "default";
}
function validateBaselineArtifacts(artifacts) {
  if (artifacts.profile !== "baseline") {
    throw new Error(`Golden baseline promotion requires profile 'baseline', received '${artifacts.profile}'.`);
  }
}
function resolveGoldenBaselineLocation(options) {
  const storeRoot = path2.resolve(options.goldens_root);
  const baselineId = sanitizeBaselineId(options.baseline_id);
  const storeVersion = "v1";
  const baselineDir = path2.join(storeRoot, storeVersion, baselineId);
  return {
    store_root: storeRoot,
    store_version: storeVersion,
    baseline_id: baselineId,
    baseline_dir: baselineDir,
    baseline_artifact_file: path2.join(baselineDir, "baseline.norm.json"),
    metadata_file: path2.join(baselineDir, "metadata.json")
  };
}
async function readGoldenBaseline(location) {
  try {
    const [metadataRaw, artifactRaw] = await Promise.all([
      fs.readFile(location.metadata_file, "utf8"),
      fs.readFile(location.baseline_artifact_file, "utf8")
    ]);
    const metadata = JSON.parse(metadataRaw);
    const artifact = JSON.parse(artifactRaw);
    validateBaselineArtifacts(artifact);
    return {
      location,
      metadata,
      artifact
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function writeGoldenBaseline(options) {
  validateBaselineArtifacts(options.artifact);
  const promotedAt = options.promoted_at ?? (/* @__PURE__ */ new Date()).toISOString();
  const metadata = {
    schema_version: GOLDEN_METADATA_SCHEMA_V1,
    store_version: options.location.store_version,
    baseline_id: options.location.baseline_id,
    promoted_at: promotedAt,
    source_candidate_file: toWorkspaceRelativePath(options.source_candidate_file, options.location.store_root),
    artifact: {
      profile: "baseline",
      normalized_artifact_file: path2.basename(options.location.baseline_artifact_file),
      scenario_count: options.artifact.scenarios.length,
      scenario_ids: options.artifact.scenarios.map((scenario) => scenario.scenario_id)
    }
  };
  await fs.mkdir(options.location.baseline_dir, { recursive: true });
  await fs.writeFile(options.location.baseline_artifact_file, `${stableStringify(options.artifact)}
`, "utf8");
  await fs.writeFile(options.location.metadata_file, `${stableStringify(metadata)}
`, "utf8");
  return {
    location: options.location,
    metadata,
    artifact: options.artifact
  };
}

// src/test/replay/core/BaselinePromotion.ts
function getScenarioSignature(artifact, scenarioId) {
  const scenario = artifact.scenarios.find((item) => item.scenario_id === scenarioId);
  return scenario ? JSON.stringify(scenario.normalized_events) : "";
}
async function readCandidateArtifacts(candidateFile) {
  const raw = await fs2.readFile(path3.resolve(candidateFile), "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.profile !== "baseline") {
    throw new Error(`Promotion requires a baseline artifact file; received profile '${parsed.profile}'.`);
  }
  return parsed;
}
function summarizePromotionDiff(location, candidate, existing) {
  const candidateIds = candidate.scenarios.map((scenario) => scenario.scenario_id);
  const existingIds = existing ? existing.artifact.scenarios.map((scenario) => scenario.scenario_id) : [];
  const candidateSet = new Set(candidateIds);
  const existingSet = new Set(existingIds);
  const added = candidateIds.filter((scenarioId) => !existingSet.has(scenarioId));
  const removed = existingIds.filter((scenarioId) => !candidateSet.has(scenarioId));
  const changed = [];
  const unchanged = [];
  for (const scenarioId of candidateIds) {
    if (!existingSet.has(scenarioId) || !existing) {
      continue;
    }
    if (getScenarioSignature(candidate, scenarioId) === getScenarioSignature(existing.artifact, scenarioId)) {
      unchanged.push(scenarioId);
      continue;
    }
    changed.push(scenarioId);
  }
  return {
    baseline_id: location.baseline_id,
    has_existing_baseline: Boolean(existing),
    total_candidate_scenarios: candidate.scenarios.length,
    added_scenarios: added,
    removed_scenarios: removed,
    changed_scenarios: changed,
    unchanged_scenarios: unchanged
  };
}
async function promoteBaseline(options) {
  const location = resolveGoldenBaselineLocation({
    goldens_root: options.goldens_root,
    baseline_id: options.baseline_id
  });
  const candidate = await readCandidateArtifacts(options.candidate_file);
  const existing = await readGoldenBaseline(location);
  const summary = summarizePromotionDiff(location, candidate, existing);
  if (!options.apply) {
    return {
      applied: false,
      guard_reason: "Dry-run mode. Re-run with --apply --approve to write baseline artifacts.",
      location,
      summary
    };
  }
  if (!options.approve) {
    return {
      applied: false,
      guard_reason: "Promotion requires explicit approval. Re-run with --approve.",
      location,
      summary
    };
  }
  if (existing && !options.force) {
    return {
      applied: false,
      guard_reason: `Baseline '${location.baseline_id}' already exists. Re-run with --force to overwrite.`,
      location,
      summary
    };
  }
  const promoted = await writeGoldenBaseline({
    location,
    artifact: candidate,
    source_candidate_file: options.candidate_file
  });
  return {
    applied: true,
    location,
    summary,
    metadata_file: promoted.location.metadata_file,
    baseline_artifact_file: promoted.location.baseline_artifact_file
  };
}

// src/test/replay/core/MigrationResolver.ts
var fs3 = __toESM(require("fs/promises"));
var path4 = __toESM(require("path"));
async function fileExists(filePath) {
  try {
    const stat2 = await fs3.stat(filePath);
    return stat2.isFile();
  } catch {
    return false;
  }
}
function getLegacyArtifactFileCandidates(kind) {
  if (kind === "baseline") {
    return ["baseline.norm.json", "baseline.json"];
  }
  return ["candidate.norm.json", "candidate.json"];
}
async function resolveFromLegacyRunDir(legacyRunDir, kind) {
  const candidates = getLegacyArtifactFileCandidates(kind).map((fileName) => path4.join(legacyRunDir, fileName));
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return {
        file: candidate,
        source: "legacy_run",
        legacy_run_dir: legacyRunDir
      };
    }
  }
  return null;
}
async function resolveLatestLegacyRun(legacyRunsRoot, kind) {
  let entries;
  try {
    entries = await fs3.readdir(legacyRunsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const runDirectories = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const absolutePath = path4.join(legacyRunsRoot, entry.name);
      const stat2 = await fs3.stat(absolutePath);
      return {
        path: absolutePath,
        mtime_ms: stat2.mtimeMs
      };
    })
  );
  runDirectories.sort((left, right) => right.mtime_ms - left.mtime_ms);
  for (const runDir of runDirectories) {
    const resolved = await resolveFromLegacyRunDir(runDir.path, kind);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
function resolveLegacyRunDirPath(legacyRunsRoot, legacyRunDir) {
  if (path4.isAbsolute(legacyRunDir)) {
    return path4.resolve(legacyRunDir);
  }
  return path4.resolve(legacyRunsRoot, legacyRunDir);
}
async function resolveReplayArtifact(options) {
  if (options.explicit_file) {
    const explicitFile = path4.resolve(options.explicit_file);
    if (await fileExists(explicitFile)) {
      return {
        file: explicitFile,
        source: "explicit"
      };
    }
  }
  if (options.kind === "baseline") {
    const goldenFile = path4.resolve(options.goldens_root, "v1", options.baseline_id, "baseline.norm.json");
    if (await fileExists(goldenFile)) {
      return {
        file: goldenFile,
        source: "golden_v1"
      };
    }
  }
  if (options.legacy_run_dir) {
    const legacyRunDir = resolveLegacyRunDirPath(options.legacy_runs_root, options.legacy_run_dir);
    const resolved = await resolveFromLegacyRunDir(legacyRunDir, options.kind);
    if (resolved) {
      return resolved;
    }
  }
  return resolveLatestLegacyRun(path4.resolve(options.legacy_runs_root), options.kind);
}

// src/test/replay/core/GateEvaluator.ts
function normalizeGateMode(input) {
  const mode = (input ?? "warn").trim().toLowerCase();
  if (mode === "strict" || mode === "warn" || mode === "info") {
    return mode;
  }
  return "warn";
}
function toAnnotationLevel(mode) {
  if (mode === "strict") {
    return "error";
  }
  if (mode === "warn") {
    return "warning";
  }
  return "notice";
}
function evaluateReplayGate(comparison, modeInput) {
  return evaluateReplayGateWithOptions(comparison, modeInput);
}
function comparisonHasBlockingFailure(comparison) {
  return !comparison.passed || comparison.summary.high_severity_drifts > 0;
}
function driftFingerprint(comparison) {
  const drifts = comparison.scenarios.flatMap((scenario) => scenario.drifts);
  const tokens = drifts.map((drift) => `${drift.scenario_id}|${drift.check_id}|${drift.severity}|${drift.message}`).sort((left, right) => left.localeCompare(right));
  return tokens.join("||");
}
function normalizeEvidenceRef2(ref) {
  return ref.trim().replace(/\\/g, "/");
}
function renderAnnotationEvidenceSuffix(annotation) {
  const suffixTokens = [];
  if (annotation.evidence_refs && annotation.evidence_refs.length > 0) {
    const normalizedRefs = annotation.evidence_refs.map((ref) => normalizeEvidenceRef2(ref)).filter((ref) => ref.length > 0);
    if (normalizedRefs.length > 0) {
      suffixTokens.push(`evidence_refs=${normalizedRefs.join("|")}`);
    }
  }
  if (annotation.evidence_fingerprint) {
    suffixTokens.push(`evidence_fingerprint=${annotation.evidence_fingerprint}`);
  }
  if (suffixTokens.length === 0) {
    return "";
  }
  return ` [${suffixTokens.join(" ")}]`;
}
function evaluateReplayGateWithOptions(comparison, modeInput, options = {}) {
  const mode = normalizeGateMode(modeInput);
  const annotations = [];
  const level = toAnnotationLevel(mode);
  const retried = options.retry_comparison !== void 0;
  const primaryBlockingFailure = comparisonHasBlockingFailure(comparison);
  const retryBlockingFailure = options.retry_comparison ? comparisonHasBlockingFailure(options.retry_comparison) : false;
  const classification = primaryBlockingFailure && retried && !retryBlockingFailure ? "intermittent_flake" : primaryBlockingFailure ? "deterministic_regression" : "clean";
  const sameDriftFingerprint = options.retry_comparison ? driftFingerprint(comparison) === driftFingerprint(options.retry_comparison) : true;
  const triage_labels = classification === "intermittent_flake" ? ["replay", "intermittent", "flake", `gate:${mode}`] : classification === "deterministic_regression" ? ["replay", "deterministic-regression", `gate:${mode}`, sameDriftFingerprint ? "stable-fingerprint" : "changed-fingerprint"] : ["replay", "clean", `gate:${mode}`];
  const explainability_rollup = comparison.summary.explainability_rollup;
  for (const scenario of comparison.scenarios) {
    for (const drift of scenario.drifts) {
      annotations.push({
        level,
        scenario_id: scenario.scenario_id,
        check_id: drift.check_id,
        severity: drift.severity,
        message: drift.message,
        evidence_refs: drift.evidence?.artifact_refs,
        evidence_fingerprint: drift.evidence?.fingerprint
      });
    }
  }
  const strictFailed = classification === "deterministic_regression";
  if (mode === "strict") {
    return {
      mode,
      passed: !strictFailed,
      status: strictFailed ? "FAIL" : classification === "intermittent_flake" ? "WARN" : "PASS",
      reason: strictFailed ? "Strict gate failed due to deterministic replay regression." : classification === "intermittent_flake" ? "Strict gate retried once and recovered; labeling as intermittent flake." : "Strict gate passed with no blocking replay drift.",
      classification,
      triage_labels,
      retried,
      annotations,
      summary: comparison.summary,
      explainability_rollup,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  if (mode === "warn") {
    return {
      mode,
      passed: true,
      status: annotations.length > 0 ? "WARN" : "PASS",
      reason: annotations.length > 0 ? "Warn gate allows CI to pass while emitting replay drift annotations." : "Warn gate passed with no replay drift annotations.",
      classification,
      triage_labels,
      retried,
      annotations,
      summary: comparison.summary,
      explainability_rollup,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    mode,
    passed: true,
    status: annotations.length > 0 ? "INFO" : "PASS",
    reason: annotations.length > 0 ? "Info gate collected replay drift insights without failing CI." : "Info gate passed with no replay drift annotations.",
    classification,
    triage_labels,
    retried,
    annotations,
    summary: comparison.summary,
    explainability_rollup,
    generated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function evaluateReplayGateWithRetry(primaryComparison, retryComparison, modeInput) {
  return evaluateReplayGateWithOptions(primaryComparison, modeInput, {
    retry_comparison: retryComparison
  });
}
function renderReplayGateSummaryMarkdown(evaluation) {
  return [
    "## Replay Gate Summary",
    "",
    `- Mode: ${evaluation.mode}`,
    `- Status: ${evaluation.status}`,
    `- Passed: ${evaluation.passed ? "yes" : "no"}`,
    `- Reason: ${evaluation.reason}`,
    `- Classification: ${evaluation.classification}`,
    `- Retried: ${evaluation.retried ? "yes" : "no"}`,
    `- Triage labels: ${evaluation.triage_labels.join(", ")}`,
    `- Total scenarios: ${evaluation.summary.total_scenarios}`,
    `- Failed scenarios: ${evaluation.summary.failed_scenarios}`,
    `- High drifts: ${evaluation.summary.high_severity_drifts}`,
    `- Medium drifts: ${evaluation.summary.medium_severity_drifts}`,
    `- Low drifts: ${evaluation.summary.low_severity_drifts}`,
    `- Annotation count: ${evaluation.annotations.length}`
  ].join("\n");
}
function toGitHubAnnotations(evaluation) {
  return evaluation.annotations.map(
    (annotation) => `::${annotation.level} title=Replay Gate (${annotation.severity.toUpperCase()})::[${evaluation.classification}] ${annotation.scenario_id} ${annotation.check_id} ${annotation.message}${renderAnnotationEvidenceSuffix(annotation)}`
  );
}

// src/test/replay/core/ReplayOrchestrator.ts
var fs4 = __toESM(require("fs/promises"));
var path6 = __toESM(require("path"));

// src/test/replay/core/Normalize.ts
var path5 = __toESM(require("path"));
var VOLATILE_ID_PATTERNS = [
  /\b(sess|run|req)_[A-Za-z0-9_-]+\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /\b[0-9A-HJKMNP-TV-Z]{26}\b/g
];
var NON_DETERMINISTIC_TEXT_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g,
  /\b\d{10,}\b/g
];
var ACTION_ALIAS_MAP = {
  run: "execute",
  send: "execute",
  create: "execute",
  kill: "terminate",
  close: "terminate"
};
var WINDOWS_ABSOLUTE_PATH_PATTERN = /[A-Za-z]:\\[^\s"']+/g;
var POSIX_ABSOLUTE_PATH_PATTERN = /(^|[\s"'(=])(\/[\w.\-/]+)/g;
function toForwardSlashPath(value) {
  return value.replace(/\\/g, "/");
}
function canonicalizeAbsolutePath(value, workspacePath) {
  const normalizedValue = toForwardSlashPath(value);
  if (!workspacePath) {
    return normalizedValue;
  }
  const workspaceCandidates = /* @__PURE__ */ new Set();
  const workspaceRaw = toForwardSlashPath(workspacePath).replace(/\/+$/, "");
  const workspaceResolved = toForwardSlashPath(path5.resolve(workspacePath)).replace(/\/+$/, "");
  if (workspaceRaw.length > 0) {
    workspaceCandidates.add(workspaceRaw);
    workspaceCandidates.add(workspaceRaw.toLowerCase());
  }
  if (workspaceResolved.length > 0) {
    workspaceCandidates.add(workspaceResolved);
    workspaceCandidates.add(workspaceResolved.toLowerCase());
  }
  for (const candidate of workspaceCandidates) {
    if (candidate.length === 0) {
      continue;
    }
    const normalizedCandidate = candidate.replace(/\/+$/, "");
    const candidateIsMatch = normalizedValue.toLowerCase().startsWith(`${normalizedCandidate.toLowerCase()}/`);
    const candidateIsSelf = normalizedValue.toLowerCase() === normalizedCandidate.toLowerCase();
    if (candidateIsMatch || candidateIsSelf) {
      const relative2 = normalizedValue.slice(normalizedCandidate.length).replace(/^\//, "");
      return relative2.length > 0 ? relative2 : ".";
    }
  }
  return normalizedValue;
}
function canonicalizePathTokens(input, workspacePath) {
  const windowsNormalized = input.replace(
    WINDOWS_ABSOLUTE_PATH_PATTERN,
    (match) => canonicalizeAbsolutePath(match, workspacePath)
  );
  return windowsNormalized.replace(POSIX_ABSOLUTE_PATH_PATTERN, (match, prefix, absolutePath) => {
    const normalizedPath = canonicalizeAbsolutePath(absolutePath, workspacePath);
    return `${prefix}${normalizedPath}`;
  });
}
function canonicalizeAction(rawAction) {
  if (!rawAction) {
    return void 0;
  }
  const normalized = rawAction.trim().toLowerCase();
  return ACTION_ALIAS_MAP[normalized] ?? normalized;
}
function normalizeStringValue(input, options, workspacePath) {
  let value = input;
  if (options.maskIds) {
    for (const pattern of VOLATILE_ID_PATTERNS) {
      value = value.replace(pattern, "<ID>");
    }
  }
  if (options.canonicalizePaths) {
    value = canonicalizePathTokens(value, workspacePath);
  }
  if (options.stripNondeterministicText) {
    for (const pattern of NON_DETERMINISTIC_TEXT_PATTERNS) {
      value = value.replace(pattern, "<NONDET>");
    }
  }
  return value;
}
function normalizeUnknown(value, options, workspacePath) {
  if (typeof value === "string") {
    return normalizeStringValue(value, options, workspacePath);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUnknown(entry, options, workspacePath));
  }
  if (value && typeof value === "object") {
    const record = value;
    const normalizedEntries = Object.entries(record).map(([key, entry]) => [
      key,
      normalizeUnknown(entry, options, workspacePath)
    ]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}
function normalizeTraceEvents(events, options = {}) {
  const baseTimestamp = events.length > 0 ? events[0].timestamp_ms : 0;
  const effective = {
    maskIds: options.maskIds ?? true,
    canonicalizeTimestamps: options.canonicalizeTimestamps ?? true,
    canonicalizePaths: options.canonicalizePaths ?? true,
    stripNondeterministicText: options.stripNondeterministicText ?? true
  };
  return events.map((event) => {
    const normalizedTimestamp = effective.canonicalizeTimestamps ? Math.max(0, event.timestamp_ms - baseTimestamp) : event.timestamp_ms;
    const actionCanonical = canonicalizeAction(event.action_raw) ?? event.action_canonical;
    const payload = event.payload ? normalizeUnknown(
      event.payload,
      {
        maskIds: effective.maskIds,
        canonicalizePaths: effective.canonicalizePaths,
        stripNondeterministicText: effective.stripNondeterministicText
      },
      options.workspacePath
    ) : void 0;
    return {
      ...event,
      timestamp_ms: normalizedTimestamp,
      action_canonical: actionCanonical,
      tool_name: event.tool_name ? event.tool_name.trim() : event.tool_name,
      payload
    };
  });
}

// src/test/replay/core/TraceCapture.ts
async function captureScenarioArtifact(scenario, context, runner, options = {}) {
  const rawEvents = await runner(scenario, context);
  const normalizedEvents = normalizeTraceEvents(rawEvents, {
    workspacePath: options.workspacePath,
    maskIds: scenario.normalization?.mask_ids,
    canonicalizeTimestamps: scenario.normalization?.canonicalize_timestamps,
    canonicalizePaths: scenario.normalization?.canonicalize_paths,
    stripNondeterministicText: scenario.normalization?.strip_nondeterministic_text
  });
  return {
    scenario_id: scenario.scenario_id,
    profile: context.profile,
    raw_events: rawEvents,
    normalized_events: normalizedEvents,
    success: normalizedEvents.some((event) => event.event_type === "outcome")
  };
}
function createRawTraceEventEnvelopes(runId, profileArtifacts) {
  const envelopes = [];
  for (const scenario of profileArtifacts.scenarios) {
    for (const event of scenario.raw_events) {
      envelopes.push({
        run_id: runId,
        profile: profileArtifacts.profile,
        scenario_id: scenario.scenario_id,
        event
      });
    }
  }
  return envelopes;
}

// src/test/replay/core/ReplayOrchestrator.ts
var ReplayOrchestrator = class {
  outputRoot;
  runner;
  constructor(options) {
    this.outputRoot = path6.resolve(options.output_root);
    this.runner = options.runner ?? defaultScenarioRunner;
  }
  async run(scenarios, label, workspacePath) {
    const runId = `${label}-${Date.now()}`;
    const outputDir = path6.join(this.outputRoot, runId);
    await fs4.mkdir(outputDir, { recursive: true });
    const baseline = await this.executeProfile("baseline", scenarios, runId, workspacePath);
    const candidate = await this.executeProfile("candidate", scenarios, runId, workspacePath);
    const baselineRawFile = path6.join(outputDir, "baseline.raw.jsonl");
    const candidateRawFile = path6.join(outputDir, "candidate.raw.jsonl");
    const baselineFile = path6.join(outputDir, "baseline.norm.json");
    const candidateFile = path6.join(outputDir, "candidate.norm.json");
    await this.writeJsonLines(baselineRawFile, createRawTraceEventEnvelopes(runId, baseline));
    await this.writeJsonLines(candidateRawFile, createRawTraceEventEnvelopes(runId, candidate));
    await this.writeJsonFile(baselineFile, baseline);
    await this.writeJsonFile(candidateFile, candidate);
    const manifest = {
      run_id: runId,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      scenario_count: scenarios.length,
      output_dir: toWorkspaceRelativePath(outputDir, workspacePath),
      baseline_artifact_file: toWorkspaceRelativePath(baselineFile, workspacePath),
      candidate_artifact_file: toWorkspaceRelativePath(candidateFile, workspacePath),
      baseline_raw_artifact_file: toWorkspaceRelativePath(baselineRawFile, workspacePath),
      candidate_raw_artifact_file: toWorkspaceRelativePath(candidateRawFile, workspacePath),
      baseline_normalized_artifact_file: toWorkspaceRelativePath(baselineFile, workspacePath),
      candidate_normalized_artifact_file: toWorkspaceRelativePath(candidateFile, workspacePath),
      artifact_envelope: {
        baseline: {
          raw_file: toWorkspaceRelativePath(baselineRawFile, workspacePath),
          normalized_file: toWorkspaceRelativePath(baselineFile, workspacePath),
          scenario_count: baseline.scenarios.length
        },
        candidate: {
          raw_file: toWorkspaceRelativePath(candidateRawFile, workspacePath),
          normalized_file: toWorkspaceRelativePath(candidateFile, workspacePath),
          scenario_count: candidate.scenarios.length
        }
      },
      determinism_env: {
        node_version: process.version,
        tz: process.env.TZ ?? "UTC",
        locale: process.env.LC_ALL ?? process.env.LANG ?? "C.UTF-8"
      }
    };
    await this.writeJsonFile(path6.join(outputDir, "manifest.json"), manifest);
    return {
      manifest,
      baseline,
      candidate
    };
  }
  async capture(profileName, scenarios, label, workspacePath) {
    const runId = `${label}-${profileName}-${Date.now()}`;
    const outputDir = path6.join(this.outputRoot, runId);
    await fs4.mkdir(outputDir, { recursive: true });
    const profile = await this.executeProfile(profileName, scenarios, runId, workspacePath);
    const rawOutputFile = path6.join(outputDir, `${profileName}.raw.jsonl`);
    const outputFile = path6.join(outputDir, `${profileName}.norm.json`);
    await this.writeJsonLines(rawOutputFile, createRawTraceEventEnvelopes(runId, profile));
    await this.writeJsonFile(outputFile, profile);
    return {
      profile,
      output_file: outputFile,
      raw_output_file: rawOutputFile
    };
  }
  async executeProfile(profileName, scenarios, runId, workspacePath) {
    const scenarioArtifacts = [];
    for (const scenario of scenarios) {
      const artifact = await captureScenarioArtifact(
        scenario,
        {
          profile: profileName,
          run_id: runId
        },
        this.runner,
        {
          workspacePath
        }
      );
      scenarioArtifacts.push(artifact);
    }
    return {
      profile: profileName,
      scenarios: scenarioArtifacts
    };
  }
  async writeJsonLines(filePath, rows) {
    const serialized = rows.map((row) => stableStringify(row)).join("\n");
    const payload = serialized.length > 0 ? `${serialized}
` : "";
    await fs4.mkdir(path6.dirname(filePath), { recursive: true });
    await fs4.writeFile(filePath, payload, "utf8");
  }
  async writeJsonFile(filePath, data) {
    await fs4.mkdir(path6.dirname(filePath), { recursive: true });
    await fs4.writeFile(filePath, `${stableStringify(data)}
`, "utf8");
  }
};
var AUTH_REASON_BY_OUTCOME = {
  allowed: "allowlist_match",
  allowed_with_warning: "interactive_warning",
  blocked: "policy_block"
};
async function defaultScenarioRunner(scenario, context) {
  let timestamp = Date.now();
  const events = [];
  for (const step of scenario.steps) {
    timestamp += 25;
    if (step.kind === "user") {
      events.push({
        event_type: "user_prompt",
        timestamp_ms: timestamp,
        scenario_id: scenario.scenario_id,
        step_id: step.id,
        payload: {
          prompt: step.prompt,
          profile: context.profile
        }
      });
      continue;
    }
    if (step.kind === "wait") {
      events.push({
        event_type: "wait",
        timestamp_ms: timestamp,
        scenario_id: scenario.scenario_id,
        step_id: step.id,
        payload: {
          wait_ms: step.wait_ms ?? 100
        }
      });
      continue;
    }
    if (step.kind === "tool") {
      const authOutcome = step.expect_auth ?? "allowed";
      events.push({
        event_type: "tool_call",
        timestamp_ms: timestamp,
        scenario_id: scenario.scenario_id,
        step_id: step.id,
        tool_name: step.tool,
        action_raw: step.action,
        authorization: {
          outcome: authOutcome,
          reason_class: AUTH_REASON_BY_OUTCOME[authOutcome]
        },
        payload: {
          args: step.args,
          profile: context.profile
        }
      });
      if (step.tool === "memory_agent" && (step.action === "handoff" || step.action === "complete")) {
        events.push({
          event_type: step.action,
          timestamp_ms: timestamp + 1,
          scenario_id: scenario.scenario_id,
          step_id: step.id,
          payload: {
            to_agent: step.args?.to_agent,
            from_agent: step.args?.from_agent
          }
        });
      }
      if (step.tool === "memory_plan" && step.action === "confirm") {
        events.push({
          event_type: "confirmation",
          timestamp_ms: timestamp + 1,
          scenario_id: scenario.scenario_id,
          step_id: step.id
        });
      }
      if (step.tool === "memory_steps" && step.action === "update") {
        events.push({
          event_type: "plan_step_update",
          timestamp_ms: timestamp + 1,
          scenario_id: scenario.scenario_id,
          step_id: step.id
        });
      }
    }
  }
  for (const signature of scenario.expectations.success_signature.must_include) {
    timestamp += 10;
    events.push({
      event_type: "outcome",
      timestamp_ms: timestamp,
      scenario_id: scenario.scenario_id,
      success_signature: signature,
      phase: "final"
    });
  }
  return events;
}

// src/test/replay/core/ScenarioSchema.ts
var fs5 = __toESM(require("fs/promises"));
var import_node_crypto = require("node:crypto");
var path7 = __toESM(require("path"));
var SCHEMA_VERSION = "1.0";
var SCENARIO_ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;
function toObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value;
}
function toString(value, context) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value.trim();
}
function normalizeScenarioId(input) {
  const normalized = input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!SCENARIO_ID_PATTERN.test(normalized)) {
    throw new Error(`scenario_id '${input}' cannot be normalized to a valid uppercase snake-case ID.`);
  }
  return normalized;
}
function normalizeTerminalSurface(input) {
  if (input === "memory_terminal" || input === "memory_terminal_interactive" || input === "auto") {
    return input;
  }
  return "auto";
}
function normalizeTagToken(input) {
  return input.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}
function normalizeTags(sourceTags, tagMetadata) {
  const explicitTags = Array.isArray(sourceTags) ? sourceTags.filter((item) => typeof item === "string").map((item) => normalizeTagToken(item)).filter(Boolean) : [];
  const inferredTags = [];
  if (tagMetadata) {
    const domain = typeof tagMetadata.domain === "string" ? normalizeTagToken(`domain:${tagMetadata.domain}`) : void 0;
    const surface = typeof tagMetadata.surface === "string" ? normalizeTagToken(`surface:${tagMetadata.surface}`) : void 0;
    const risk = typeof tagMetadata.risk === "string" ? normalizeTagToken(`risk:${tagMetadata.risk}`) : void 0;
    const priority = typeof tagMetadata.priority === "string" ? normalizeTagToken(`priority:${tagMetadata.priority}`) : void 0;
    if (domain) {
      inferredTags.push(domain);
    }
    if (surface) {
      inferredTags.push(surface);
    }
    if (risk) {
      inferredTags.push(risk);
    }
    if (priority) {
      inferredTags.push(priority);
    }
  }
  return Array.from(/* @__PURE__ */ new Set([...explicitTags, ...inferredTags]));
}
function toNonNegativeInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return void 0;
  }
  return value >= 0 ? Math.floor(value) : void 0;
}
function computeScenarioDigest(scenario) {
  const { scenario_digest: _digest, ...rest } = scenario;
  return (0, import_node_crypto.createHash)("sha256").update(stableStringify(rest)).digest("hex");
}
function normalizeChecks(value, scenarioId) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => {
    const check = toObject(entry, `checks[${index}]`);
    const id = toString(check.id ?? `CHECK_${index + 1}`, `checks[${index}].id`);
    const type = toString(check.type, `checks[${index}].type`);
    const severity = toString(check.severity ?? "medium", `checks[${index}].severity`);
    if (type !== "tool_order" && type !== "auth_outcome" && type !== "flow" && type !== "success_signature") {
      throw new Error(`checks[${index}] in ${scenarioId} has unsupported type '${type}'.`);
    }
    if (severity !== "low" && severity !== "medium" && severity !== "high") {
      throw new Error(`checks[${index}] in ${scenarioId} has unsupported severity '${severity}'.`);
    }
    const expectedValue = check.expected;
    const normalizedExpected = typeof expectedValue === "string" || Array.isArray(expectedValue) ? expectedValue : void 0;
    return {
      id,
      type,
      severity,
      required: typeof check.required === "boolean" ? check.required : true,
      strict_order: typeof check.strict_order === "boolean" ? check.strict_order : void 0,
      expected: normalizedExpected,
      metadata: typeof check.metadata === "object" && check.metadata ? check.metadata : void 0
    };
  });
}
function normalizeSteps(value, scenarioId) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${scenarioId} must declare at least one step.`);
  }
  return value.map((entry, index) => {
    const step = toObject(entry, `${scenarioId}.steps[${index}]`);
    const kind = toString(step.kind, `${scenarioId}.steps[${index}].kind`);
    if (kind !== "user" && kind !== "tool" && kind !== "wait") {
      throw new Error(`${scenarioId}.steps[${index}] has unsupported kind '${kind}'.`);
    }
    const normalized = {
      kind,
      id: typeof step.id === "string" ? step.id : `step_${index + 1}`,
      metadata: typeof step.metadata === "object" && step.metadata ? step.metadata : void 0
    };
    if (kind === "user") {
      normalized.prompt = toString(step.prompt, `${scenarioId}.steps[${index}].prompt`);
    }
    if (kind === "tool") {
      normalized.tool = toString(step.tool, `${scenarioId}.steps[${index}].tool`);
      normalized.action = typeof step.action === "string" ? step.action : "run";
      normalized.args = typeof step.args === "object" && step.args ? step.args : void 0;
      const auth = step.expect_auth;
      if (auth === "allowed" || auth === "allowed_with_warning" || auth === "blocked") {
        normalized.expect_auth = auth;
      }
    }
    if (kind === "wait") {
      const waitMs = typeof step.wait_ms === "number" ? step.wait_ms : 100;
      normalized.wait_ms = waitMs > 0 ? waitMs : 100;
    }
    return normalized;
  });
}
function normalizeScenario(input, index) {
  const source = toObject(input, `scenarios[${index}]`);
  const rawId = toString(source.scenario_id, `scenarios[${index}].scenario_id`);
  const scenarioId = normalizeScenarioId(rawId);
  const workspace = toObject(source.workspace, `${scenarioId}.workspace`);
  const runtime = toObject(source.runtime, `${scenarioId}.runtime`);
  const expectations = toObject(source.expectations, `${scenarioId}.expectations`);
  const successSignature = toObject(expectations.success_signature, `${scenarioId}.expectations.success_signature`);
  const mustInclude = Array.isArray(successSignature.must_include) ? successSignature.must_include.filter((item) => typeof item === "string" && item.length > 0) : [];
  if (mustInclude.length === 0) {
    throw new Error(`${scenarioId} must include at least one success signature.`);
  }
  const tagMetadata = typeof source.tag_metadata === "object" && source.tag_metadata ? source.tag_metadata : void 0;
  const stabilization = typeof source.stabilization === "object" && source.stabilization ? source.stabilization : void 0;
  const acceptanceThresholds = typeof source.acceptance_thresholds === "object" && source.acceptance_thresholds ? source.acceptance_thresholds : void 0;
  const normalizedScenario = {
    schema_version: SCHEMA_VERSION,
    scenario_id: scenarioId,
    title: toString(source.title, `${scenarioId}.title`),
    intent: toString(source.intent, `${scenarioId}.intent`),
    driver: "copilot-sdk",
    workspace: {
      workspace_path: toString(workspace.workspace_path, `${scenarioId}.workspace.workspace_path`),
      workspace_id: toString(workspace.workspace_id, `${scenarioId}.workspace.workspace_id`)
    },
    runtime: {
      mode: runtime.mode === "interactive" ? "interactive" : "headless",
      terminal_surface: normalizeTerminalSurface(runtime.terminal_surface)
    },
    steps: normalizeSteps(source.steps, scenarioId),
    expectations: {
      success_signature: {
        must_include: mustInclude,
        allow_missing: Array.isArray(successSignature.allow_missing) ? successSignature.allow_missing.filter((item) => typeof item === "string") : []
      },
      checks: normalizeChecks(expectations.checks, scenarioId)
    },
    tags: normalizeTags(source.tags, tagMetadata),
    tag_metadata: tagMetadata ? {
      domain: typeof tagMetadata.domain === "string" ? tagMetadata.domain.trim() : void 0,
      surface: typeof tagMetadata.surface === "string" ? tagMetadata.surface.trim() : void 0,
      risk: tagMetadata.risk === "p0" || tagMetadata.risk === "p1" || tagMetadata.risk === "p2" ? tagMetadata.risk : void 0,
      priority: tagMetadata.priority === "high" || tagMetadata.priority === "medium" || tagMetadata.priority === "low" ? tagMetadata.priority : void 0
    } : void 0,
    stabilization: stabilization ? {
      fixture_seed: toNonNegativeInt(stabilization.fixture_seed),
      frozen_clock_delta_ms: toNonNegativeInt(stabilization.frozen_clock_delta_ms),
      wait_budget_ms: toNonNegativeInt(stabilization.wait_budget_ms),
      resolver_fixture_tree: typeof stabilization.resolver_fixture_tree === "string" ? stabilization.resolver_fixture_tree.trim() : void 0
    } : void 0,
    acceptance_thresholds: acceptanceThresholds ? {
      max_total_drifts: toNonNegativeInt(acceptanceThresholds.max_total_drifts),
      max_high_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_high_severity_drifts),
      max_medium_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_medium_severity_drifts),
      max_low_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_low_severity_drifts)
    } : void 0,
    source_refs: Array.isArray(source.source_refs) ? source.source_refs.filter((item) => typeof item === "string") : [],
    determinism: source.determinism === "strict" || source.determinism === "moderate" || source.determinism === "loose" ? source.determinism : "strict",
    timeouts: typeof source.timeouts === "object" && source.timeouts ? {
      run_timeout_ms: typeof source.timeouts.run_timeout_ms === "number" ? source.timeouts.run_timeout_ms : void 0,
      step_timeout_ms: typeof source.timeouts.step_timeout_ms === "number" ? source.timeouts.step_timeout_ms : void 0
    } : void 0,
    normalization: typeof source.normalization === "object" && source.normalization ? {
      mask_ids: Boolean(source.normalization.mask_ids),
      canonicalize_timestamps: Boolean(source.normalization.canonicalize_timestamps),
      canonicalize_paths: Boolean(source.normalization.canonicalize_paths),
      strip_nondeterministic_text: Boolean(
        source.normalization.strip_nondeterministic_text
      )
    } : void 0,
    metadata: typeof source.metadata === "object" && source.metadata ? source.metadata : void 0
  };
  const waitBudget = normalizedScenario.stabilization?.wait_budget_ms;
  if (typeof waitBudget === "number" && waitBudget > 0) {
    normalizedScenario.steps = normalizedScenario.steps.map((step) => {
      if (step.kind !== "wait") {
        return step;
      }
      const waitMs = step.wait_ms ?? 100;
      return {
        ...step,
        wait_ms: Math.min(waitMs, waitBudget)
      };
    });
  }
  normalizedScenario.scenario_digest = computeScenarioDigest(normalizedScenario);
  return normalizedScenario;
}
function parseScenarioSuite(input) {
  const source = toObject(input, "scenario suite");
  const rawScenarios = source.scenarios;
  if (!Array.isArray(rawScenarios)) {
    throw new Error("scenario suite must include a scenarios array.");
  }
  const scenarios = rawScenarios.map((entry, index) => normalizeScenario(entry, index));
  const duplicateIds = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  for (const scenario of scenarios) {
    if (seen.has(scenario.scenario_id)) {
      duplicateIds.add(scenario.scenario_id);
    }
    seen.add(scenario.scenario_id);
  }
  if (duplicateIds.size > 0) {
    throw new Error(`duplicate scenario_id values found: ${Array.from(duplicateIds).join(", ")}`);
  }
  return {
    schema_version: SCHEMA_VERSION,
    scenarios
  };
}
async function loadScenarioSuite(scenariosPath) {
  const absolutePath = path7.resolve(scenariosPath);
  const raw = await fs5.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  return parseScenarioSuite(parsed);
}

// src/test/replay/core/ReportWriter.ts
var fs6 = __toESM(require("fs/promises"));
var path8 = __toESM(require("path"));
var EXPLAINABILITY_CATEGORY_ORDER = [
  "flow_protocol",
  "authorization_policy",
  "tool_sequence",
  "success_signature",
  "artifact_integrity"
];
var EXPLAINABILITY_CONFIDENCE_ORDER = ["high", "medium", "low"];
var EXPLAINABILITY_BUCKET_ORDER = ["blocker", "actionable", "monitor"];
async function writeReplayReport(outputDir, comparison, workspacePath) {
  const absoluteOutputDir = path8.resolve(outputDir);
  await fs6.mkdir(absoluteOutputDir, { recursive: true });
  const comparisonJsonPath = path8.join(absoluteOutputDir, "comparison.json");
  const reportMarkdownPath = path8.join(absoluteOutputDir, "report.md");
  await fs6.writeFile(comparisonJsonPath, `${stableStringify(comparison)}
`, "utf8");
  await fs6.writeFile(reportMarkdownPath, `${renderReplayReportMarkdown(comparison)}
`, "utf8");
  return {
    comparison_json: toWorkspaceRelativePath(comparisonJsonPath, workspacePath),
    report_markdown: toWorkspaceRelativePath(reportMarkdownPath, workspacePath)
  };
}
function normalizeEvidenceRef3(ref) {
  return ref.trim().replace(/\\/g, "/");
}
function renderReplayReportMarkdown(comparison) {
  const header = [
    "# Replay Drift Report",
    "",
    `- Generated at: ${comparison.generated_at}`,
    `- Comparator profile: ${comparison.profile_name}`,
    `- Overall result: ${comparison.passed ? "PASS" : "FAIL"}`,
    ""
  ];
  const summary = [
    "## Summary",
    "",
    `- Total scenarios: ${comparison.summary.total_scenarios}`,
    `- Passed scenarios: ${comparison.summary.passed_scenarios}`,
    `- Failed scenarios: ${comparison.summary.failed_scenarios}`,
    `- High severity drifts: ${comparison.summary.high_severity_drifts}`,
    `- Medium severity drifts: ${comparison.summary.medium_severity_drifts}`,
    `- Low severity drifts: ${comparison.summary.low_severity_drifts}`,
    ""
  ];
  const details = ["## Scenario Results", ""];
  for (const scenario of comparison.scenarios) {
    details.push(`### ${scenario.scenario_id} \u2014 ${scenario.passed ? "PASS" : "FAIL"}`);
    details.push("");
    details.push(`- Checks executed: ${scenario.checks_executed.length}`);
    if (scenario.drifts.length === 0) {
      details.push("- Drift findings: none");
      details.push("");
      continue;
    }
    details.push("- Drift findings:");
    for (const drift of scenario.drifts) {
      details.push(`  - [${drift.severity.toUpperCase()}] ${drift.check_id}: ${drift.message}`);
    }
    details.push("");
  }
  const explainability = renderExplainabilitySection(comparison);
  return [...header, ...summary, ...details, ...explainability].join("\n");
}
function hasExplainabilityData(comparison) {
  if (comparison.summary.explainability_rollup) {
    return true;
  }
  for (const scenario of comparison.scenarios) {
    if ((scenario.explainability_groups?.length ?? 0) > 0) {
      return true;
    }
    if (scenario.drifts.some((drift) => driftHasExplainability(drift))) {
      return true;
    }
  }
  return false;
}
function driftHasExplainability(drift) {
  return Boolean(
    drift.category || drift.confidence || drift.operator_bucket || drift.remediation || drift.evidence
  );
}
function renderExplainabilitySection(comparison) {
  if (!hasExplainabilityData(comparison)) {
    return [];
  }
  const lines = ["## Explainability", ""];
  const rollup = comparison.summary.explainability_rollup;
  if (rollup) {
    lines.push("### Rollup", "");
    if (typeof rollup.total_explained_drifts === "number") {
      lines.push(`- Explained drifts: ${rollup.total_explained_drifts}`);
    }
    const categorySummary = renderCountMap(rollup.by_category, EXPLAINABILITY_CATEGORY_ORDER);
    if (categorySummary) {
      lines.push(`- By category: ${categorySummary}`);
    }
    const confidenceSummary = renderCountMap(rollup.by_confidence, EXPLAINABILITY_CONFIDENCE_ORDER);
    if (confidenceSummary) {
      lines.push(`- By confidence: ${confidenceSummary}`);
    }
    const bucketSummary = renderCountMap(rollup.by_operator_bucket, EXPLAINABILITY_BUCKET_ORDER);
    if (bucketSummary) {
      lines.push(`- By operator bucket: ${bucketSummary}`);
    }
    lines.push("");
  }
  const scenarioGroups = comparison.scenarios.filter((scenario) => (scenario.explainability_groups?.length ?? 0) > 0);
  if (scenarioGroups.length > 0) {
    lines.push("### Group Summaries", "");
    for (const scenario of scenarioGroups) {
      lines.push(`#### ${scenario.scenario_id}`);
      for (const group of scenario.explainability_groups ?? []) {
        const confidenceParts = [];
        if (typeof group.high_confidence === "number") {
          confidenceParts.push(`high ${group.high_confidence}`);
        }
        if (typeof group.medium_confidence === "number") {
          confidenceParts.push(`medium ${group.medium_confidence}`);
        }
        if (typeof group.low_confidence === "number") {
          confidenceParts.push(`low ${group.low_confidence}`);
        }
        const bucketParts = [];
        if (typeof group.blocker_bucket === "number") {
          bucketParts.push(`blocker ${group.blocker_bucket}`);
        }
        if (typeof group.actionable_bucket === "number") {
          bucketParts.push(`actionable ${group.actionable_bucket}`);
        }
        if (typeof group.monitor_bucket === "number") {
          bucketParts.push(`monitor ${group.monitor_bucket}`);
        }
        const confidenceText = confidenceParts.length > 0 ? `; confidence ${confidenceParts.join(", ")}` : "";
        const bucketText = bucketParts.length > 0 ? `; buckets ${bucketParts.join(", ")}` : "";
        lines.push(`- ${group.category}: ${group.total_drifts} drift(s)${confidenceText}${bucketText}`);
      }
      lines.push("");
    }
  }
  const topActions = collectTopActions(comparison);
  if (topActions.length > 0) {
    lines.push("### Top Actions", "");
    for (const action of topActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }
  const evidenceHandles = collectEvidenceHandles(comparison);
  if (evidenceHandles.length > 0) {
    lines.push("### Evidence Handles", "");
    for (const evidence of evidenceHandles) {
      lines.push(`- ${evidence}`);
    }
    lines.push("");
  }
  return lines;
}
function renderCountMap(map, order) {
  if (!map) {
    return void 0;
  }
  const entries = order.map((key) => [key, map[key]]).filter((entry) => typeof entry[1] === "number");
  if (entries.length === 0) {
    return void 0;
  }
  return entries.map(([key, value]) => `${key} ${value}`).join(", ");
}
function collectTopActions(comparison) {
  const frequency = /* @__PURE__ */ new Map();
  for (const scenario of comparison.scenarios) {
    for (const drift of scenario.drifts) {
      for (const action of drift.remediation?.recommended_actions ?? []) {
        const normalized = action.trim();
        if (!normalized) {
          continue;
        }
        frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
      }
    }
  }
  return Array.from(frequency.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 5).map(([action, count]) => `${action} (x${count})`);
}
function collectEvidenceHandles(comparison) {
  const handles = /* @__PURE__ */ new Set();
  for (const scenario of comparison.scenarios) {
    for (const drift of scenario.drifts) {
      const fingerprint = drift.evidence?.fingerprint?.trim();
      if (fingerprint) {
        handles.add(`fingerprint:${fingerprint}`);
      }
      for (const ref of drift.evidence?.artifact_refs ?? []) {
        const normalized = normalizeEvidenceRef3(ref);
        if (normalized) {
          handles.add(`artifact:${normalized}`);
        }
      }
    }
  }
  return Array.from(handles).sort((left, right) => left.localeCompare(right));
}

// src/test/replay/cli/replay-cli.ts
function resolveManifestOutputDir(manifestOutputDir, workspacePath) {
  if (path9.isAbsolute(manifestOutputDir)) {
    return manifestOutputDir;
  }
  const basePath = workspacePath ? path9.resolve(workspacePath) : process.cwd();
  return path9.resolve(basePath, manifestOutputDir);
}
function parseArgs(argv) {
  const command = argv[2] ?? "run";
  const options = /* @__PURE__ */ new Map();
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(key, ["true"]);
      continue;
    }
    const values = options.get(key) ?? [];
    values.push(next);
    options.set(key, values);
    index += 1;
  }
  const scenariosPath = options.get("scenarios")?.[0] ?? path9.resolve(__dirname, "../scenarios/baseline-scenarios.v1.json");
  const profilePath = options.get("profile")?.[0] ?? path9.resolve(__dirname, "../config/default.profile.json");
  const outputDir = options.get("out")?.[0] ?? path9.resolve(process.cwd(), ".replay-runs");
  const label = options.get("label")?.[0] ?? "replay";
  const scenarioFilter = options.get("scenario");
  const tagFilter = options.get("tag")?.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  const shardIndexRaw = options.get("shard-index")?.[0];
  const shardCountRaw = options.get("shard-count")?.[0];
  const shardIndex = typeof shardIndexRaw === "string" ? Number.parseInt(shardIndexRaw, 10) : void 0;
  const shardCount = typeof shardCountRaw === "string" ? Number.parseInt(shardCountRaw, 10) : void 0;
  const captureProfileToken = options.get("capture-profile")?.[0];
  const captureProfile = captureProfileToken === "baseline" || captureProfileToken === "candidate" ? captureProfileToken : void 0;
  const parseBooleanOption = (key) => {
    const value = options.get(key)?.[0];
    return value === "true";
  };
  const gateModeToken = (options.get("gate-mode")?.[0] ?? "warn").trim().toLowerCase();
  const gateMode = gateModeToken === "strict" || gateModeToken === "warn" || gateModeToken === "info" ? gateModeToken : "warn";
  return {
    command,
    scenariosPath,
    profilePath,
    outputDir,
    label,
    workspacePath: options.get("workspace-path")?.[0],
    scenarioFilter,
    tagFilter,
    shardIndex: Number.isFinite(shardIndex) ? shardIndex : void 0,
    shardCount: Number.isFinite(shardCount) ? shardCount : void 0,
    captureProfile,
    baselineFile: options.get("baseline")?.[0],
    candidateFile: options.get("candidate")?.[0],
    comparisonFile: options.get("comparison")?.[0],
    baselineId: options.get("baseline-id")?.[0] ?? "default",
    goldensRoot: options.get("goldens-root")?.[0] ?? path9.resolve(__dirname, "../goldens"),
    gateMode,
    gateOutput: options.get("gate-output")?.[0],
    emitGithubAnnotations: parseBooleanOption("emit-github-annotations"),
    retryOnce: parseBooleanOption("retry-once"),
    legacyRunsRoot: options.get("legacy-runs-root")?.[0] ?? outputDir,
    legacyRunDir: options.get("legacy-run-dir")?.[0],
    apply: parseBooleanOption("apply"),
    approve: parseBooleanOption("approve"),
    force: parseBooleanOption("force")
  };
}
function filterScenariosByTags(scenarios, tags) {
  if (!tags || tags.length === 0) {
    return scenarios;
  }
  const required = new Set(tags.map((tag) => tag.toLowerCase()));
  return scenarios.filter((scenario) => {
    const scenarioTags = new Set((scenario.tags ?? []).map((tag) => tag.toLowerCase()));
    for (const tag of required) {
      if (scenarioTags.has(tag)) {
        return true;
      }
    }
    return false;
  });
}
function shardScenarios(scenarios, shardIndex, shardCount) {
  if (typeof shardIndex !== "number" || typeof shardCount !== "number") {
    return scenarios;
  }
  if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount) || shardCount <= 0 || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error(`Invalid shard arguments: shard-index=${String(shardIndex)}, shard-count=${String(shardCount)}.`);
  }
  const ordered = [...scenarios].sort((left, right) => left.scenario_id.localeCompare(right.scenario_id));
  return ordered.filter((_, index) => index % shardCount === shardIndex);
}
function selectScenarios(scenarios, options) {
  const byId = filterScenarios(scenarios, options.scenarioFilter);
  const byTag = filterScenariosByTags(byId, options.tagFilter);
  return shardScenarios(byTag, options.shardIndex, options.shardCount);
}
async function writeGateSummaryArtifacts(outputDir, gateOutputOption, markdown, payload, workspacePath) {
  const resolvedOutputDir = path9.resolve(outputDir);
  await fs7.mkdir(resolvedOutputDir, { recursive: true });
  const summaryJsonPath = gateOutputOption ? path9.resolve(gateOutputOption) : path9.join(resolvedOutputDir, "gate-summary.json");
  const gateMarkdownPath = path9.join(resolvedOutputDir, "gate-summary.md");
  await fs7.mkdir(path9.dirname(summaryJsonPath), { recursive: true });
  await fs7.writeFile(summaryJsonPath, `${stableStringify(payload)}
`, "utf8");
  await fs7.writeFile(gateMarkdownPath, `${markdown}
`, "utf8");
  return {
    summary_file: toWorkspaceRelativePath(summaryJsonPath, workspacePath),
    markdown_file: toWorkspaceRelativePath(gateMarkdownPath, workspacePath)
  };
}
async function loadProfile(profilePath) {
  const raw = await fs7.readFile(path9.resolve(profilePath), "utf8");
  const parsed = JSON.parse(raw);
  return parsed;
}
function filterScenarios(scenarios, ids) {
  if (!ids || ids.length === 0) {
    return scenarios;
  }
  const requested = new Set(ids.map((value) => value.trim().toUpperCase()));
  return scenarios.filter((scenario) => requested.has(scenario.scenario_id));
}
async function readArtifacts(filePath) {
  const raw = await fs7.readFile(path9.resolve(filePath), "utf8");
  return JSON.parse(raw);
}
async function runCommand(options) {
  const suite = await loadScenarioSuite(options.scenariosPath);
  const profile = await loadProfile(options.profilePath);
  const scenarios = selectScenarios(suite.scenarios, options);
  if (scenarios.length === 0) {
    throw new Error("No scenarios matched the provided scenario/tag/shard filters.");
  }
  const orchestrator = new ReplayOrchestrator({ output_root: options.outputDir });
  const result = await orchestrator.run(scenarios, options.label, options.workspacePath);
  const resolvedManifestOutputDir = resolveManifestOutputDir(result.manifest.output_dir, options.workspacePath);
  const comparison = compareReplayRuns(scenarios, result.baseline, result.candidate, profile);
  let retryComparison;
  if (options.retryOnce && (!comparison.passed || comparison.summary.high_severity_drifts > 0)) {
    const retryResult = await orchestrator.run(scenarios, `${options.label}-retry`, options.workspacePath);
    retryComparison = compareReplayRuns(scenarios, retryResult.baseline, retryResult.candidate, profile);
  }
  const report = await writeReplayReport(resolvedManifestOutputDir, comparison, options.workspacePath);
  const gate = evaluateReplayGateWithRetry(comparison, retryComparison, options.gateMode);
  const gateSummaryMarkdown = renderReplayGateSummaryMarkdown(gate);
  const gateArtifacts = await writeGateSummaryArtifacts(resolvedManifestOutputDir, options.gateOutput, gateSummaryMarkdown, {
    gate,
    explainability_rollup: gate.explainability_rollup,
    report,
    flake_controls: {
      retry_once_enabled: options.retryOnce,
      retry_performed: retryComparison !== void 0,
      retry_summary: retryComparison?.summary
    }
  }, options.workspacePath);
  process.stdout.write(`Replay run complete.
`);
  process.stdout.write(`Manifest: ${path9.join(resolvedManifestOutputDir, "manifest.json")}
`);
  process.stdout.write(`Comparison: ${report.comparison_json}
`);
  process.stdout.write(`Markdown report: ${report.report_markdown}
`);
  process.stdout.write(`${gateSummaryMarkdown}
`);
  process.stdout.write(`Gate summary JSON: ${gateArtifacts.summary_file}
`);
  process.stdout.write(`Gate summary Markdown: ${gateArtifacts.markdown_file}
`);
  if (options.emitGithubAnnotations) {
    for (const line of toGitHubAnnotations(gate)) {
      process.stdout.write(`${line}
`);
    }
  }
  const githubStepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (githubStepSummaryPath) {
    await fs7.appendFile(githubStepSummaryPath, `${gateSummaryMarkdown}

`, "utf8");
  }
  if (!gate.passed) {
    process.exitCode = 1;
  }
}
async function captureCommand(options) {
  const suite = await loadScenarioSuite(options.scenariosPath);
  const scenarios = selectScenarios(suite.scenarios, options);
  const profileName = options.captureProfile ?? "baseline";
  if (scenarios.length === 0) {
    throw new Error("No scenarios matched the provided scenario/tag/shard filters.");
  }
  const orchestrator = new ReplayOrchestrator({ output_root: options.outputDir });
  const result = await orchestrator.capture(profileName, scenarios, options.label, options.workspacePath);
  process.stdout.write(`Capture complete (${profileName}).
`);
  process.stdout.write(`Artifact: ${result.output_file}
`);
  process.stdout.write(`Raw artifact: ${result.raw_output_file}
`);
}
async function compareCommand(options) {
  const resolvedBaseline = await resolveReplayArtifact({
    kind: "baseline",
    explicit_file: options.baselineFile,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    legacy_runs_root: options.legacyRunsRoot,
    legacy_run_dir: options.legacyRunDir
  });
  const resolvedCandidate = await resolveReplayArtifact({
    kind: "candidate",
    explicit_file: options.candidateFile,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    legacy_runs_root: options.legacyRunsRoot,
    legacy_run_dir: options.legacyRunDir
  });
  if (!resolvedBaseline || !resolvedCandidate) {
    throw new Error(
      "compare command could not resolve artifacts. Provide --baseline and --candidate, or use --baseline-id plus --legacy-runs-root/--legacy-run-dir for legacy replay outputs."
    );
  }
  const suite = await loadScenarioSuite(options.scenariosPath);
  const profile = await loadProfile(options.profilePath);
  const scenarios = selectScenarios(suite.scenarios, options);
  if (scenarios.length === 0) {
    throw new Error("No scenarios matched the provided scenario/tag/shard filters.");
  }
  const baseline = await readArtifacts(resolvedBaseline.file);
  const candidate = await readArtifacts(resolvedCandidate.file);
  const comparison = compareReplayRuns(scenarios, baseline, candidate, profile);
  const outputDir = path9.resolve(options.outputDir, `${options.label}-${Date.now()}`);
  const report = await writeReplayReport(outputDir, comparison, options.workspacePath);
  const gate = evaluateReplayGate(comparison, options.gateMode);
  const gateSummaryMarkdown = renderReplayGateSummaryMarkdown(gate);
  const gateArtifacts = await writeGateSummaryArtifacts(outputDir, options.gateOutput, gateSummaryMarkdown, {
    gate,
    explainability_rollup: gate.explainability_rollup,
    report
  }, options.workspacePath);
  process.stdout.write(`Comparison complete.
`);
  process.stdout.write(`Resolved baseline (${resolvedBaseline.source}): ${resolvedBaseline.file}
`);
  process.stdout.write(`Resolved candidate (${resolvedCandidate.source}): ${resolvedCandidate.file}
`);
  process.stdout.write(`Comparison: ${report.comparison_json}
`);
  process.stdout.write(`Markdown report: ${report.report_markdown}
`);
  process.stdout.write(`${gateSummaryMarkdown}
`);
  process.stdout.write(`Gate summary JSON: ${gateArtifacts.summary_file}
`);
  process.stdout.write(`Gate summary Markdown: ${gateArtifacts.markdown_file}
`);
  if (options.emitGithubAnnotations) {
    for (const line of toGitHubAnnotations(gate)) {
      process.stdout.write(`${line}
`);
    }
  }
  const githubStepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (githubStepSummaryPath) {
    await fs7.appendFile(githubStepSummaryPath, `${gateSummaryMarkdown}

`, "utf8");
  }
  if (!gate.passed) {
    process.exitCode = 1;
  }
}
async function reportCommand(options) {
  if (!options.comparisonFile) {
    throw new Error("report command requires --comparison <comparison.json>.");
  }
  const raw = await fs7.readFile(path9.resolve(options.comparisonFile), "utf8");
  const comparison = JSON.parse(raw);
  const markdown = renderReplayReportMarkdown(comparison);
  const outputDir = path9.resolve(options.outputDir, `${options.label}-${Date.now()}`);
  await fs7.mkdir(outputDir, { recursive: true });
  const reportPath = path9.join(outputDir, "report.md");
  await fs7.writeFile(reportPath, `${markdown}
`, "utf8");
  process.stdout.write(`Report rendered: ${reportPath}
`);
}
async function listScenariosCommand(options) {
  const suite = await loadScenarioSuite(options.scenariosPath);
  const scenarios = selectScenarios(suite.scenarios, options);
  for (const scenario of scenarios) {
    const tags = scenario.tags && scenario.tags.length > 0 ? ` [${scenario.tags.join(", ")}]` : "";
    process.stdout.write(`${scenario.scenario_id}: ${scenario.title}${tags}
`);
  }
}
async function promoteBaselineCommand(options) {
  const resolvedBaselineForPromotion = await resolveReplayArtifact({
    kind: "baseline",
    explicit_file: options.candidateFile,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    legacy_runs_root: options.legacyRunsRoot,
    legacy_run_dir: options.legacyRunDir
  });
  if (!resolvedBaselineForPromotion) {
    throw new Error(
      "promote-baseline command requires --candidate <baseline.norm.json>, or legacy run artifacts resolvable via --legacy-runs-root/--legacy-run-dir."
    );
  }
  const result = await promoteBaseline({
    candidate_file: resolvedBaselineForPromotion.file,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    apply: options.apply,
    approve: options.approve,
    force: options.force
  });
  process.stdout.write(`Baseline id: ${result.summary.baseline_id}
`);
  process.stdout.write(`Resolved source (${resolvedBaselineForPromotion.source}): ${resolvedBaselineForPromotion.file}
`);
  process.stdout.write(`Store location: ${result.location.baseline_dir}
`);
  process.stdout.write(`Existing baseline: ${result.summary.has_existing_baseline ? "yes" : "no"}
`);
  process.stdout.write(`Candidate scenarios: ${result.summary.total_candidate_scenarios}
`);
  process.stdout.write(`Added scenarios: ${result.summary.added_scenarios.length}
`);
  process.stdout.write(`Removed scenarios: ${result.summary.removed_scenarios.length}
`);
  process.stdout.write(`Changed scenarios: ${result.summary.changed_scenarios.length}
`);
  process.stdout.write(`Unchanged scenarios: ${result.summary.unchanged_scenarios.length}
`);
  if (!result.applied) {
    process.stdout.write(`Promotion not applied: ${result.guard_reason ?? "guarded write path not satisfied"}
`);
    if (options.apply) {
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write(`Promotion applied.
`);
  process.stdout.write(`Baseline artifact: ${result.baseline_artifact_file}
`);
  process.stdout.write(`Metadata: ${result.metadata_file}
`);
}
async function migrateLegacyRunsCommand(options) {
  const resolvedLegacyBaseline = await resolveReplayArtifact({
    kind: "baseline",
    explicit_file: options.candidateFile,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    legacy_runs_root: options.legacyRunsRoot,
    legacy_run_dir: options.legacyRunDir
  });
  if (!resolvedLegacyBaseline || resolvedLegacyBaseline.source === "golden_v1") {
    throw new Error(
      "migrate-legacy-runs requires a legacy baseline artifact. Provide --candidate or --legacy-runs-root/--legacy-run-dir pointing to historical replay run output."
    );
  }
  const result = await promoteBaseline({
    candidate_file: resolvedLegacyBaseline.file,
    goldens_root: options.goldensRoot,
    baseline_id: options.baselineId,
    apply: options.apply,
    approve: options.approve,
    force: options.force
  });
  process.stdout.write(`Legacy migration baseline id: ${result.summary.baseline_id}
`);
  process.stdout.write(`Resolved legacy source (${resolvedLegacyBaseline.source}): ${resolvedLegacyBaseline.file}
`);
  if (resolvedLegacyBaseline.legacy_run_dir) {
    process.stdout.write(`Legacy run directory: ${resolvedLegacyBaseline.legacy_run_dir}
`);
  }
  process.stdout.write(`Store location: ${result.location.baseline_dir}
`);
  if (!result.applied) {
    process.stdout.write(`Migration not applied: ${result.guard_reason ?? "guarded write path not satisfied"}
`);
    if (options.apply) {
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write("Migration applied.\n");
  process.stdout.write(`Baseline artifact: ${result.baseline_artifact_file}
`);
  process.stdout.write(`Metadata: ${result.metadata_file}
`);
}
async function main() {
  process.env.TZ = process.env.TZ ?? "UTC";
  process.env.LANG = process.env.LANG ?? "C.UTF-8";
  process.env.LC_ALL = process.env.LC_ALL ?? process.env.LANG;
  const options = parseArgs(process.argv);
  if (options.command === "run") {
    await runCommand(options);
    return;
  }
  if (options.command === "capture") {
    await captureCommand(options);
    return;
  }
  if (options.command === "compare") {
    await compareCommand(options);
    return;
  }
  if (options.command === "report") {
    await reportCommand(options);
    return;
  }
  if (options.command === "list-scenarios") {
    await listScenariosCommand(options);
    return;
  }
  if (options.command === "promote-baseline") {
    await promoteBaselineCommand(options);
    return;
  }
  if (options.command === "migrate-legacy-runs") {
    await migrateLegacyRunsCommand(options);
    return;
  }
  throw new Error(
    `Unknown command '${options.command}'. Supported: run, capture, compare, report, list-scenarios, promote-baseline, migrate-legacy-runs.`
  );
}
main().catch((error) => {
  process.stderr.write(`Replay CLI failed: ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
