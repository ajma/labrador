import { useQuery } from '@tanstack/react-query';
import { Box, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';
import { TablePagination } from '../components/TablePagination';

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports: { PrivatePort: number; PublicPort?: number; Type: string }[];
}

function shortId(id: string): string {
  return id.slice(0, 12);
}

function containerName(names: string[]): string {
  if (!names || names.length === 0) return '<unknown>';
  return names[0].replace(/^\//, '');
}

function formatPorts(ports: DockerContainer['Ports']): string {
  if (!ports || ports.length === 0) return '-';
  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}:${p.PrivatePort}/${p.Type}`)
    .join(', ') || '-';
}

const stateStyles: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  running: { bg: 'bg-[rgba(74,222,128,0.10)]', text: 'text-[#4ade80]', border: 'border-[rgba(74,222,128,0.25)]', dot: 'bg-[#4ade80] shadow-[0_0_6px_rgba(74,222,128,0.5)]' },
  exited: { bg: 'bg-[rgba(248,113,113,0.08)]', text: 'text-[rgba(248,113,113,0.85)]', border: 'border-[rgba(248,113,113,0.20)]', dot: 'bg-[rgba(248,113,113,0.85)]' },
  paused: { bg: 'bg-[rgba(250,204,21,0.08)]', text: 'text-[#facc15]', border: 'border-[rgba(250,204,21,0.20)]', dot: 'bg-[#facc15]' },
  restarting: { bg: 'bg-primary/[0.10]', text: 'text-primary', border: 'border-primary/[0.25]', dot: 'bg-primary animate-pulse' },
};

function StateBadge({ state }: { state: string }) {
  const s = stateStyles[state] ?? { bg: 'bg-[rgba(255,255,255,0.04)]', text: 'text-[rgba(255,255,255,0.38)]', border: 'border-[rgba(255,255,255,0.10)]', dot: 'bg-[rgba(255,255,255,0.20)]' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${s.bg} ${s.text} ${s.border}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {state}
    </span>
  );
}

export function Containers() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { data: containers, isLoading } = useQuery<DockerContainer[]>({
    queryKey: ['containers'],
    queryFn: () => api.get('/docker/containers'),
    refetchInterval: 5000,
  });

  const filtered = containers?.filter((c) => {
    if (!filter) return true;
    const query = filter.toLowerCase();
    const name = containerName(c.Names).toLowerCase();
    const image = c.Image.toLowerCase();
    const id = shortId(c.Id).toLowerCase();
    return name.includes(query) || image.includes(query) || id.includes(query);
  });

  const paginated = filtered?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-[rgba(255,255,255,0.92)]">Containers</h1>

      {!isLoading && containers && containers.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.28)]" />
          <Input
            placeholder="Filter by name, image, or ID…"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-primary/[0.08] bg-primary/[0.03]" />
          ))}
        </div>
      )}

      {!isLoading && containers?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/[0.15] bg-primary/[0.02] p-12 text-center">
          <Box className="mb-3 h-8 w-8 text-primary opacity-40" />
          <p className="text-sm text-[rgba(255,255,255,0.35)]">No containers running.</p>
        </div>
      )}

      {!isLoading && containers && containers.length > 0 && filtered?.length === 0 && (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/[0.16] p-8 text-center">
          <p className="text-sm text-[rgba(255,255,255,0.35)]">No containers match your filter.</p>
        </div>
      )}

      {!isLoading && filtered && filtered.length > 0 && (
        <div className="rounded-2xl border border-white/[0.16] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.14] bg-[rgba(255,255,255,0.02)]">
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Name</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Image</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Container ID</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">State</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Status</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Ports</th>
              </tr>
            </thead>
            <tbody>
              {paginated!.map((container) => (
                <tr
                  key={container.Id}
                  className={`border-b border-white/[0.18] last:border-0 ${container.State === 'running' ? 'bg-[rgba(74,222,128,0.015)]' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-[rgba(255,255,255,0.85)]">{containerName(container.Names)}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.45)]">{container.Image}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[rgba(255,255,255,0.35)]">{shortId(container.Id)}</td>
                  <td className="px-4 py-3">
                    <StateBadge state={container.State} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.38)]">{container.Status}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[rgba(255,255,255,0.45)]">{formatPorts(container.Ports)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
