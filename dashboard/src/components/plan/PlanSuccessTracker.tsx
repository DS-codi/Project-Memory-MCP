import { useMemo } from 'react';
import { cn } from '@/utils/cn';
import { CheckCircle, Circle, AlertCircle, Target, Award } from 'lucide-react';
import type { PlanStep, PlanStatus } from '@/types';

interface PlanSuccessTrackerProps {
  steps: PlanStep[];
  goals?: string[];
  successCriteria?: string[];
  status: PlanStatus;
  className?: string;
}

interface GoalProgress {
  goal: string;
  achieved: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export function PlanSuccessTracker({
  steps,
  goals = [],
  successCriteria = [],
  status,
  className,
}: PlanSuccessTrackerProps) {
  const stepMetrics = useMemo(() => {
    const total = steps.length;
    const done = steps.filter((s) => s.status === 'done').length;
    const active = steps.filter((s) => s.status === 'active').length;
    const blocked = steps.filter((s) => s.status === 'blocked').length;
    const pending = steps.filter((s) => s.status === 'pending').length;
    
    const completionRate = total > 0 ? (done / total) * 100 : 0;
    
    // Calculate velocity (steps completed per phase)
    const phases = [...new Set(steps.map((s) => s.phase))];
    const completedPhases = phases.filter((phase) => {
      const phaseSteps = steps.filter((s) => s.phase === phase);
      return phaseSteps.every((s) => s.status === 'done');
    });
    
    return {
      total,
      done,
      active,
      blocked,
      pending,
      completionRate,
      totalPhases: phases.length,
      completedPhases: completedPhases.length,
    };
  }, [steps]);

  const goalProgress = useMemo<GoalProgress[]>(() => {
    // Simple goal tracking - in a real implementation, this would be
    // more sophisticated and tied to actual verification
    return goals.map((goal) => {
      // Heuristic: if most steps are done, goal is likely achieved
      const achieved = stepMetrics.completionRate > 90;
      const confidence: 'high' | 'medium' | 'low' =
        stepMetrics.completionRate > 80 ? 'high' :
        stepMetrics.completionRate > 50 ? 'medium' : 'low';
      
      return { goal, achieved, confidence };
    });
  }, [goals, stepMetrics.completionRate]);

  const criteriaProgress = useMemo(() => {
    // Track success criteria - simplified version
    return successCriteria.map((criterion) => {
      const met = status === 'completed' || status === 'archived';
      return { criterion, met };
    });
  }, [successCriteria, status]);

  const overallScore = useMemo(() => {
    const weights = {
      stepCompletion: 40,
      phaseCompletion: 20,
      goalsAchieved: 25,
      criteriaMet: 15,
    };

    const stepScore = stepMetrics.completionRate;
    const phaseScore = stepMetrics.totalPhases > 0
      ? (stepMetrics.completedPhases / stepMetrics.totalPhases) * 100
      : 0;
    const goalScore = goals.length > 0
      ? (goalProgress.filter((g) => g.achieved).length / goals.length) * 100
      : 100;
    const criteriaScore = successCriteria.length > 0
      ? (criteriaProgress.filter((c) => c.met).length / successCriteria.length) * 100
      : 100;

    return (
      (stepScore * weights.stepCompletion +
       phaseScore * weights.phaseCompletion +
       goalScore * weights.goalsAchieved +
       criteriaScore * weights.criteriaMet) /
      (weights.stepCompletion + weights.phaseCompletion + weights.goalsAchieved + weights.criteriaMet)
    );
  }, [stepMetrics, goalProgress, criteriaProgress, goals.length, successCriteria.length]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overall Progress Score */}
      <div className="p-6 bg-slate-800 rounded-lg text-center">
        <div className="relative inline-flex items-center justify-center w-32 h-32">
          {/* Circular progress background */}
          <svg className="absolute w-full h-full -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-700"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke={
                overallScore >= 80 ? '#22c55e' :
                overallScore >= 50 ? '#eab308' :
                '#ef4444'
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(overallScore / 100) * 352} 352`}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold">{Math.round(overallScore)}</span>
            <span className="text-xs text-slate-400 uppercase">Score</span>
          </div>
        </div>
        <h3 className="mt-4 text-lg font-medium">
          {overallScore >= 80 ? 'On Track' :
           overallScore >= 50 ? 'In Progress' :
           'Needs Attention'}
        </h3>
        <p className="text-sm text-slate-400">
          Plan Success Rating
        </p>
      </div>

      {/* Step Progress */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Target size={16} className="text-blue-400" />
            Step Progress
          </h4>
          <span className="text-sm font-medium">
            {stepMetrics.done}/{stepMetrics.total}
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500"
            style={{ width: `${(stepMetrics.done / Math.max(1, stepMetrics.total)) * 100}%` }}
          />
          <div
            className="h-full bg-blue-500"
            style={{ width: `${(stepMetrics.active / Math.max(1, stepMetrics.total)) * 100}%` }}
          />
          <div
            className="h-full bg-red-500"
            style={{ width: `${(stepMetrics.blocked / Math.max(1, stepMetrics.total)) * 100}%` }}
          />
        </div>
        
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Done: {stepMetrics.done}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Active: {stepMetrics.active}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Blocked: {stepMetrics.blocked}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Pending: {stepMetrics.pending}
          </span>
        </div>
      </div>

      {/* Goals */}
      {goals.length > 0 && (
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Award size={16} className="text-purple-400" />
            Goals ({goalProgress.filter((g) => g.achieved).length}/{goals.length})
          </h4>
          <div className="space-y-2">
            {goalProgress.map((goalItem, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 bg-slate-800 rounded"
              >
                {goalItem.achieved ? (
                  <CheckCircle size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{goalItem.goal}</p>
                  <span
                    className={cn(
                      'text-xs',
                      goalItem.confidence === 'high' && 'text-green-400',
                      goalItem.confidence === 'medium' && 'text-yellow-400',
                      goalItem.confidence === 'low' && 'text-slate-500'
                    )}
                  >
                    {goalItem.confidence} confidence
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Criteria */}
      {successCriteria.length > 0 && (
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-green-400" />
            Success Criteria ({criteriaProgress.filter((c) => c.met).length}/{successCriteria.length})
          </h4>
          <div className="space-y-2">
            {criteriaProgress.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 bg-slate-800 rounded"
              >
                {item.met ? (
                  <CheckCircle size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm">{item.criterion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
