import { useState } from 'react';
import { BookOpen, CheckCircle, XCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';
import { useSkills, useSkillContent } from '@/hooks/useSkills';
import { formatRelative } from '@/utils/formatters';
import type { SkillInfo } from '@/types';

interface SkillsPanelProps {
  workspaceId: string;
  className?: string;
}

interface SkillRowProps {
  skill: SkillInfo;
  isSelected: boolean;
  onSelect: () => void;
}

function SkillRow({ skill, isSelected, onSelect }: SkillRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected
          ? 'bg-violet-500/10 border-l-2 border-violet-500'
          : 'hover:bg-slate-700/50 border-l-2 border-transparent',
      )}
    >
      {isSelected ? (
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      ) : (
        <ChevronRight size={14} className="text-slate-400 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200 truncate">{skill.name}</span>
          {skill.deployed ? (
            <CheckCircle size={14} className="text-green-400 shrink-0" />
          ) : (
            <XCircle size={14} className="text-slate-500 shrink-0" />
          )}
        </div>
        {skill.description && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{skill.description}</p>
        )}
      </div>

      {skill.deployed && skill.deployed_at && (
        <span className="text-xs text-slate-500 shrink-0">
          {formatRelative(skill.deployed_at)}
        </span>
      )}
    </button>
  );
}

function SkillDetailViewer({
  workspaceId,
  skillName,
}: {
  workspaceId: string;
  skillName: string;
}) {
  const { data, isLoading } = useSkillContent(workspaceId, skillName);

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (!data?.content) {
    return (
      <div className="p-4 text-sm text-slate-500">No content available for this skill.</div>
    );
  }

  return (
    <div className="p-4 border-t border-slate-700/60">
      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/60 rounded p-3 max-h-64 overflow-y-auto">
        {data.content}
      </pre>
    </div>
  );
}

export function SkillsPanel({ workspaceId, className }: SkillsPanelProps) {
  const { data, isLoading } = useSkills(workspaceId);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const skills = data?.skills || [];

  if (skills.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-8 w-8 text-slate-500" />}
        title="No skills deployed"
        description="Skills provide domain-specific knowledge to agents. Deploy skills to this workspace to see them here."
        className={className}
      />
    );
  }

  const deployedCount = skills.filter((s) => s.deployed).length;

  return (
    <div className={cn('border border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Skills</h3>
        </div>
        <Badge variant="bg-slate-600/40 text-slate-300 border-slate-500/50">
          {deployedCount}/{skills.length} deployed
        </Badge>
      </div>

      {/* Skill list */}
      <div className="divide-y divide-slate-700/40">
        {skills.map((skill) => (
          <div key={skill.name}>
            <SkillRow
              skill={skill}
              isSelected={selectedSkill === skill.name}
              onSelect={() =>
                setSelectedSkill((prev) => (prev === skill.name ? null : skill.name))
              }
            />
            {selectedSkill === skill.name && (
              <SkillDetailViewer workspaceId={workspaceId} skillName={skill.name} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
