import { useState } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/cn';
import { AgentFrontmatter, HandoffEntry } from '@/types';
import { HandoffEditor } from './HandoffEditor';

interface FrontmatterEditorProps {
  content: string;
  onChange: (content: string) => void;
  agentName?: string;
  className?: string;
}

// Parse frontmatter from markdown content
function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter | null; body: string; raw: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content, raw: '' };
  }

  try {
    const yaml = match[1];
    const body = match[2];
    
    // Simple YAML parsing for our specific format
    const frontmatter: AgentFrontmatter = {
      name: '',
      description: '',
      tools: [],
      handoffs: [],
    };

    // Parse name
    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    if (nameMatch) frontmatter.name = nameMatch[1].trim();

    // Parse description
    const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
    if (descMatch) frontmatter.description = descMatch[1].trim();

    // Parse tools
    const toolsMatch = yaml.match(/^tools:\s*\[(.*)\]$/m);
    if (toolsMatch) {
      frontmatter.tools = toolsMatch[1]
        .split(',')
        .map(t => t.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }

    // Parse handoffs (more complex)
    const handoffsStart = yaml.indexOf('handoffs:');
    if (handoffsStart !== -1) {
      const handoffsSection = yaml.slice(handoffsStart);
      const handoffMatches = handoffsSection.matchAll(
        /-\s*label:\s*["'](.+?)["']\n\s*agent:\s*(\w+)(?:\n\s*prompt:\s*["'](.+?)["'])?(?:\n\s*send:\s*(true|false))?/g
      );
      
      for (const m of handoffMatches) {
        frontmatter.handoffs?.push({
          label: m[1],
          agent: m[2],
          prompt: m[3] || undefined,
          send: m[4] === 'true',
        });
      }
    }

    return { frontmatter, body, raw: yaml };
  } catch {
    return { frontmatter: null, body: content, raw: match[1] };
  }
}

// Serialize frontmatter back to YAML
function serializeFrontmatter(fm: AgentFrontmatter): string {
  let yaml = `---\nname: ${fm.name}\ndescription: '${fm.description}'`;
  
  if (fm.tools && fm.tools.length > 0) {
    yaml += `\ntools: [${fm.tools.map(t => `'${t}'`).join(', ')}]`;
  }

  if (fm.handoffs && fm.handoffs.length > 0) {
    yaml += '\nhandoffs:';
    for (const h of fm.handoffs) {
      yaml += `\n  - label: "${h.label}"`;
      yaml += `\n    agent: ${h.agent}`;
      if (h.prompt) {
        yaml += `\n    prompt: "${h.prompt}"`;
      }
      if (h.send) {
        yaml += `\n    send: true`;
      }
    }
  }

  yaml += '\n---\n';
  return yaml;
}

export function FrontmatterEditor({ content, onChange, agentName, className }: FrontmatterEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const { frontmatter, body } = parseFrontmatter(content);
  
  const isValid = frontmatter !== null;
  const hasHandoffs = frontmatter?.handoffs && frontmatter.handoffs.length > 0;

  const updateFrontmatter = (updates: Partial<AgentFrontmatter>) => {
    if (!frontmatter) return;
    
    const updated = { ...frontmatter, ...updates };
    const newContent = serializeFrontmatter(updated) + body;
    onChange(newContent);
  };

  const handleHandoffsChange = (handoffs: HandoffEntry[]) => {
    updateFrontmatter({ handoffs });
  };

  if (!isValid) {
    return (
      <div className={cn('bg-amber-500/10 border border-amber-500/30 rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-amber-400 mb-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Invalid Frontmatter</span>
        </div>
        <p className="text-sm text-slate-400">
          This agent file doesn't have valid YAML frontmatter. Add frontmatter at the top of the file:
        </p>
        <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto">
{`---
name: AgentName
description: 'Agent description'
tools: ['vscode', 'execute']
handoffs:
  - label: "🔬 Handoff Label"
    agent: targetagent
    prompt: "Prompt for target agent"
---`}
        </pre>
      </div>
    );
  }

  return (
    <div className={cn('border border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="font-medium text-sm">Frontmatter Configuration</span>
          {hasHandoffs && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
              {frontmatter.handoffs?.length} handoffs
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4 bg-slate-850">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Name</label>
              <input
                type="text"
                value={frontmatter.name}
                onChange={(e) => updateFrontmatter({ name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Description</label>
              <input
                type="text"
                value={frontmatter.description}
                onChange={(e) => updateFrontmatter({ description: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tools (comma-separated)</label>
            <input
              type="text"
              value={frontmatter.tools?.join(', ') || ''}
              onChange={(e) => updateFrontmatter({ 
                tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
              })}
              placeholder="vscode, execute, read, edit, search..."
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Handoffs */}
          <HandoffEditor
            handoffs={frontmatter.handoffs || []}
            onChange={handleHandoffsChange}
            currentAgent={agentName || frontmatter.name}
          />
        </div>
      )}
    </div>
  );
}

export default FrontmatterEditor;
