import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Wand2, 
  Search, 
  Database,
  RefreshCw,
  Edit3,
  BookOpen,
  Tag,
  Code2
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { formatRelative } from '@/utils/formatters';

interface DbSkill {
  id: string;
  name: string;
  category: string;
  tags: string | null;
  language_targets: string | null;
  framework_targets: string | null;
  content: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchDbSkills(): Promise<{ skills: DbSkill[]; total: number }> {
  const res = await fetch('/api/skills/db');
  if (!res.ok) throw new Error('Failed to fetch DB skills');
  return res.json();
}

export function SkillsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['skills-db'],
    queryFn: fetchDbSkills,
  });

  const filteredSkills = data?.skills.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4">
        Failed to load skills: {(error as Error).message}
      </div>
    );
  }

  const SkillCard = ({ skill }: { skill: DbSkill }) => {
    const tags: string[] = skill.tags ? JSON.parse(skill.tags) : [];
    const languages: string[] = skill.language_targets ? JSON.parse(skill.language_targets) : [];

    return (
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-violet-500/50 transition-colors"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-500/20">
              <Wand2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">{skill.name}</h3>
              <Badge variant="bg-slate-700 text-slate-300 text-[10px] uppercase tracking-wider">
                {skill.category}
              </Badge>
            </div>
          </div>
        </div>

        {skill.description && (
          <p className="text-sm text-slate-400 mb-4 line-clamp-2">
            {skill.description}
          </p>
        )}

        <div className="flex flex-wrap gap-1 mb-4">
          {languages.map(lang => (
            <span key={lang} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 text-slate-400 rounded text-[10px]">
              <Code2 size={10} />
              {lang}
            </span>
          ))}
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 text-slate-500 rounded text-[10px]">
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-700/50">
          <span className="text-[10px] text-slate-500">{formatRelative(skill.updated_at)}</span>
          <button 
            onClick={() => navigate(`/skills/db/${skill.name}`)}
            className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors flex items-center gap-2 text-xs text-white"
          >
            <Edit3 size={12} />
            Edit
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database size={18} className="text-violet-400" />
            <h1 className="text-2xl font-bold text-white">Skill Definitions</h1>
          </div>
          <p className="text-slate-400">
            Persistent capabilities stored in the MCP database
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search skills by name, category, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-violet-500"
        />
      </div>

      {filteredSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No skills found in the database</p>
        </div>
      )}
    </div>
  );
}
