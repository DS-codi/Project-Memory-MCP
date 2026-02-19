/**
 * Investigation types — structured investigation workflow
 * for Analyst-driven analysis within plans.
 */

/** Investigation phase names - structured phases for Analyst-driven investigations */
export type InvestigationPhaseName =
  | 'intake'
  | 'recon'
  | 'hypothesis'
  | 'experiment'
  | 'validation'
  | 'synthesis'
  | 'report';

/** Status of an investigation */
export type InvestigationStatus = 'active' | 'paused' | 'complete' | 'abandoned';

/** A structured investigation within a plan */
export interface Investigation {
  id: string;                          // e.g. 'inv_abc123'
  plan_id: string;
  title: string;
  description: string;
  status: InvestigationStatus;
  current_phase: InvestigationPhaseName;
  phases: InvestigationPhaseRecord[];
  created_at: string;
  updated_at: string;
  created_by: string;                  // agent type that started it
  findings_summary?: string;           // populated on completion
}

/** Record of a completed or active investigation phase */
export interface InvestigationPhaseRecord {
  phase: InvestigationPhaseName;
  status: 'pending' | 'active' | 'done' | 'skipped';
  started_at?: string;
  completed_at?: string;
  notes?: string;
  artifacts?: string[];                // file paths of artifacts produced
}
