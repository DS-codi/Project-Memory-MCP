import { Gauge, Zap, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { difficultyLevelColors } from '@/utils/colors';
import type { DifficultyProfile, DifficultyLevel } from '@/types/schema-v2';

// =============================================================================
// Constants
// =============================================================================

const difficultyIcons: Record<DifficultyLevel, string> = {
  trivial: '🟢',
  easy: '🟩',
  moderate: '🟡',
  hard: '🟠',
  extreme: '🔴',
};

// =============================================================================
// Props
// =============================================================================

interface DifficultyProfileCardProps {
  profile?: DifficultyProfile;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function DifficultyProfileCard({ profile, className }: DifficultyProfileCardProps) {
  // Graceful empty state for v1 plans
  if (!profile) {
    return (
      <div className={cn('border border-slate-700 rounded-lg p-4', className)}>
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Gauge size={15} className="text-slate-400" />
          Difficulty Profile
        </h3>
        <p className="text-xs text-slate-500 italic">
          No difficulty profile available. Legacy v1 plans do not include this data.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('border border-slate-700 rounded-lg p-4 space-y-3', className)}>
      {/* Header + level badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Gauge size={15} className="text-slate-400" />
          Difficulty Profile
        </h3>
        <Badge variant={difficultyLevelColors[profile.level]} className="text-xs">
          {difficultyIcons[profile.level]} {profile.level}
        </Badge>
      </div>

      {/* Meta row: effort + risk level */}
      <div className="flex items-center gap-4">
        {profile.estimated_effort && (
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Clock size={13} className="text-slate-400" />
            <span>{profile.estimated_effort}</span>
          </div>
        )}
        {profile.risk_level && (
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <AlertTriangle size={13} className="text-yellow-400/70" />
            <span>{profile.risk_level}</span>
          </div>
        )}
      </div>

      {/* Complexity factors */}
      {profile.complexity_factors && profile.complexity_factors.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
            <Zap size={11} /> Complexity Factors
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.complexity_factors.map((factor) => (
              <span
                key={factor}
                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50"
              >
                {factor}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
