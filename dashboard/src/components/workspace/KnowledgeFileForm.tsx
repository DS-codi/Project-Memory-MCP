/**
 * KnowledgeFileForm — Create/Edit form for knowledge files
 */
import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';

export type KnowledgeFileCategory =
  | 'schema'
  | 'config'
  | 'limitation'
  | 'plan-summary'
  | 'reference'
  | 'convention';

export interface KnowledgeFileMeta {
  slug: string;
  title: string;
  category: KnowledgeFileCategory;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by_agent?: string;
  created_by_plan?: string;
}

export interface KnowledgeFile extends KnowledgeFileMeta {
  content: string;
}

interface KnowledgeFileFormProps {
  existingFile?: KnowledgeFile | null;
  onSave: (data: { slug: string; title: string; category: KnowledgeFileCategory; content: string; tags: string[] }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const CATEGORIES: { value: KnowledgeFileCategory; label: string }[] = [
  { value: 'reference', label: 'Reference' },
  { value: 'schema', label: 'Schema' },
  { value: 'config', label: 'Config' },
  { value: 'convention', label: 'Convention' },
  { value: 'limitation', label: 'Limitation' },
  { value: 'plan-summary', label: 'Plan Summary' },
];

export function KnowledgeFileForm({ existingFile, onSave, onCancel, isSaving }: KnowledgeFileFormProps) {
  const isEdit = !!existingFile;
  const [title, setTitle] = useState(existingFile?.title || '');
  const [slug, setSlug] = useState(existingFile?.slug || '');
  const [category, setCategory] = useState<KnowledgeFileCategory>(existingFile?.category || 'reference');
  const [content, setContent] = useState(existingFile?.content || '');
  const [tagsInput, setTagsInput] = useState((existingFile?.tags || []).join(', '));

  useEffect(() => {
    if (existingFile) {
      setTitle(existingFile.title);
      setSlug(existingFile.slug);
      setCategory(existingFile.category);
      setContent(existingFile.content);
      setTagsInput((existingFile.tags || []).join(', '));
    }
  }, [existingFile]);

  // Auto-generate slug from title for new files
  useEffect(() => {
    if (!isEdit && title) {
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
      setSlug(generated);
    }
  }, [title, isEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    onSave({ slug, title, category, content, tags });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-slate-600 rounded-lg bg-slate-800/50">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{isEdit ? 'Edit Knowledge File' : 'New Knowledge File'}</h4>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="kf-title" className="block text-xs text-slate-400 mb-1">Title</label>
          <input
            id="kf-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white"
            required
          />
        </div>
        <div>
          <label htmlFor="kf-slug" className="block text-xs text-slate-400 mb-1">Slug</label>
          <input
            id="kf-slug"
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white"
            required
            disabled={isEdit}
            pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="kf-category" className="block text-xs text-slate-400 mb-1">Category</label>
          <select
            id="kf-category"
            value={category}
            onChange={e => setCategory(e.target.value as KnowledgeFileCategory)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white"
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="kf-tags" className="block text-xs text-slate-400 mb-1">Tags (comma-separated)</label>
          <input
            id="kf-tags"
            type="text"
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white"
            placeholder="e.g. api, auth"
          />
        </div>
      </div>
      <div>
        <label htmlFor="kf-content" className="block text-xs text-slate-400 mb-1">Content (Markdown)</label>
        <textarea
          id="kf-content"
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white font-mono resize-y"
          rows={10}
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !title.trim() || !slug.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white text-sm rounded hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {isSaving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
