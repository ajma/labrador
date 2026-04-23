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
      <div className="relative flex h-[80vh] w-full max-w-5xl flex-col rounded-2xl border border-white/[0.24] bg-background/[0.97] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.20] px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Choose a Template</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="space-y-3 border-b border-white/[0.20] px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-[14px] border border-white/[0.26] bg-muted pl-10 pr-4 py-2 text-md text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/[0.5]"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  activeCategory === null
                    ? 'bg-primary/[0.15] text-primary'
                    : 'border border-white/[0.20] text-muted-foreground hover:bg-accent hover:text-foreground'
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
                      : 'border border-white/[0.20] text-muted-foreground hover:bg-accent hover:text-foreground'
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
            <p className="text-center text-sm text-muted-foreground">Loading templates…</p>
          )}
          {isError && (
            <p className="text-center text-sm text-[rgba(254,202,202,0.85)]">Failed to load templates.</p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">No templates match your search.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template.id)}
                disabled={loadingId !== null}
                className="flex items-start gap-3 rounded-xl border border-white/[0.22] bg-accent/50 p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
              >
                {template.logoUrl ? (
                  <img
                    src={template.logoUrl}
                    alt={template.name}
                    className="h-10 w-10 rounded object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-2xs font-bold text-muted-foreground">
                    {template.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-foreground">
                    {loadingId === template.id ? 'Loading…' : template.name}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {template.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-muted px-2 py-0.5 text-2xs capitalize text-muted-foreground"
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
