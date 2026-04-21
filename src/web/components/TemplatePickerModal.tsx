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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[80vh] w-full max-w-5xl flex-col rounded-xl border border-input bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-input px-6 py-4">
          <h2 className="text-lg font-semibold">Choose a Template</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="space-y-3 border-b border-input px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeCategory === null
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-input hover:bg-accent'
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
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input hover:bg-accent'
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
            <p className="text-center text-sm text-muted-foreground">Loading templates...</p>
          )}
          {isError && (
            <p className="text-center text-sm text-destructive">Failed to load templates.</p>
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
                className="flex items-start gap-3 rounded-lg border border-input p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
              >
                {template.logoUrl ? (
                  <img
                    src={template.logoUrl}
                    alt={template.name}
                    className="h-10 w-10 rounded object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground">
                    {template.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-sm">
                      {loadingId === template.id ? 'Loading...' : template.name}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground"
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
