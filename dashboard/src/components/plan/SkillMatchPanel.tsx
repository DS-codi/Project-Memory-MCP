import { BookOpen, Sparkles, FileCode } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import type { SkillMatch, PlanPhase } from '@/types/schema-v2';

// =============================================================================
// Constants
// =============================================================================

/**
 * Relevance thresholds for numeric relevance scores.
 * Maps a 0–1 number to a human-readable label + color.
 */
function relevanceLabel(score: number | undefined): { text: string; color: string } {
  if (score === undefined || score === null) {
    return { text: 'unknown', color: 'bg-slate-500/20 text-slate-300 border-slate-500/50' };
  }
  if (score >= 0.7) {
    return { text: 'high', color: 'bg-green-500/20 text-green-300 border-green-500/50' };
  }
  if (score >= 0.4) {
    return { text: 'medium', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' };
  }
  return { text: 'low', color: 'bg-slate-500/20 text-slate-400 border-slate-500/50' };
}

const relevanceIcons: Record<string, string> = {
  high: '🟢',
  medium: '🟡',
  low: '⚪',
  unknown: '⚪',
};

// =============================================================================
// Props
// =============================================================================

interface SkillMatchPanelProps {
  matchedSkills?: SkillMatch[];
  phases?: PlanPhase[];
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function SkillMatchPanel({ matchedSkills, phases, className }: SkillMatchPanelProps) {
  // Empty state for v1 plans or no matched skills
  if (!matchedSkills || matchedSkills.length === 0) {
    return (
      <div className={cn('border border-slate-700 rounded-lg p-4', className)}>
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Sparkles size={15} className="text-slate-400" />
          Matched Skills
        </h3>
        <p className="text-xs text-slate-500 italic">
          No skill matches available. Legacy v1 plans do not include skill data.
        </p>
      </div>
    );
  }

  // Count relevance distribution for the header
  const highCount = matchedSkills.filter(
    (s) => s.relevance !== undefined && s.relevance >= 0.7,
  ).length;

  return (
    <div className={cn('border border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles size={15} className="text-slate-400" />
          Matched Skills
        </h3>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <Badge
              variant="bg-green-500/20 text-green-300 border-green-500/50"
              className="text-[10px]"
            >
              {highCount} high relevance
            </Badge>
          )}
          <span className="text-xs text-slate-400">{matchedSkills.length} total</span>
        </div>
      </div>

      {/* Skill cards */}
      <div className="divide-y divide-slate-700/50">
        {matchedSkills.map((skill) => (
          <SkillCard key={skill.name} skill={skill} />
        ))}
      </div>

      {/* Phase association hint (if v2 phases exist) */}
      {phases && phases.length > 0 && (
        <div className="px-4 py-2 bg-slate-900/30 border-t border-slate-700/50">
          <p className="text-[10px] text-slate-500">
            <BookOpen size={10} className="inline mr-1" />
            {phases.length} phases defined — skills apply across all phases
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-component
// =============================================================================

function SkillCard({ skill }: { skill: SkillMatch }) {
  const rel = relevanceLabel(skill.relevance);

  return (
    <div className="px-4 py-3 bg-slate-900/40 hover:bg-slate-800/50 transition-colors space-y-1.5">
      {/* Top row: name + relevance badge */}
      <div className="flex items-center gap-2">
        <BookOpen size={13} className="text-violet-400/70 shrink-0" />
        <span className="text-xs font-medium text-slate-200 flex-1 truncate">{skill.name}</span>
        <Badge variant={rel.color} className="text-[10px] shrink-0">
          {relevanceIcons[rel.text]} {rel.text}
        </Badge>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="text-[11px] text-slate-400 ml-5">{skill.description}</p>
      )}

      {/* File path */}
      {skill.file_path && (
        <div className="flex items-center gap-1.5 ml-5">
          <FileCode size={11} className="text-slate-500 shrink-0" />
          <span className="text-[10px] text-slate-500 font-mono truncate">{skill.file_path}</span>
        </div>
      )}
    </div>
  );
}
