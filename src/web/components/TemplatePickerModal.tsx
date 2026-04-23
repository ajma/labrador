import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTemplates } from '../hooks/useTemplates';
import { api } from '../lib/api';
import type { ProjectTemplate } from '@shared/types';

interface TemplatePickerModalProps {
  onSelect: (template: ProjectTemplate) => void;
  onClose: () => void;
}

export function TemplatePickerModal({ onSelect, onClose }: TemplatePickerModalProps) {
  const { data: templates, isLoading, isError } = useTemplates();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (!templates) return [];
    return Array.from(new Set(templates.flatMap((t) => t.categories))).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    const q = search.toLowerCase();
    return templates
      .filter((t) => {
        const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
        const matchesCategory = !activeCategory || t.categories.includes(activeCategory);
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search, activeCategory]);

  async function handleSelect(id: string) {
    setLoadingId(id);
    try {
      const template = await api.get<ProjectTemplate>(`/projects/templates/${id}`);
      onSelect(template);
    } catch {
      toast.error('Failed to load template');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-full max-w-5xl flex-col rounded-2xl border border-white/[0.18] bg-background/[0.97] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.14] px-6 py-4">
          <h2 className="text-lg font-semibold text-[rgba(255,255,255,0.88)]">Choose a Template</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.65)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="space-y-3 border-b border-white/[0.14] px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.28)]" />
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] pl-10 pr-4 py-2 text-md text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.28)] outline-none transition-colors focus:border-primary/[0.5]"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  activeCategory === null
                    ? 'bg-primary/[0.15] text-primary'
                    : 'border border-white/[0.14] text-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.7)]'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    activeCategory === cat
                      ? 'bg-primary/[0.15] text-primary'
                      : 'border border-white/[0.14] text-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.7)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <p className="text-center text-sm text-[rgba(255,255,255,0.38)]">Loading templates…</p>
          )}
          {isError && (
            <p className="text-center text-sm text-[rgba(254,202,202,0.85)]">Failed to load templates.</p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="text-center text-sm text-[rgba(255,255,255,0.38)]">No templates match your search.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template.id)}
                disabled={loadingId !== null}
                className="flex items-start gap-3 rounded-xl border border-white/[0.16] bg-[rgba(255,255,255,0.02)] p-4 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
              >
                {template.logoUrl ? (
                  <img
                    src={template.logoUrl}
                    alt={template.name}
                    className="h-10 w-10 rounded object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] text-2xs font-bold text-[rgba(255,255,255,0.45)]">
                    {template.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-[rgba(255,255,255,0.85)]">
                    {loadingId === template.id ? 'Loading…' : template.name}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[rgba(255,255,255,0.40)]">
                    {template.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-2xs capitalize text-[rgba(255,255,255,0.40)]"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
