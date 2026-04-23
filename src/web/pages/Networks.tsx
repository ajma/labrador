import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Network, ChevronDown } from 'lucide-react';
import { TablePagination } from '../components/TablePagination';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';

interface DockerNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  Created: string;
  Containers: Record<string, unknown> | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function useNetworks(page: number, pageSize: number) {
  return useQuery<{ data: DockerNetwork[]; total: number }>({
    queryKey: ['networks', page, pageSize],
    queryFn: () => api.get(`/docker/networks?page=${page}&pageSize=${pageSize}`),
  });
}

function useCreateNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; driver?: string }) => api.post('/docker/networks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      toast.success('Network created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create network');
    },
  });
}

function useDeleteNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/docker/networks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      toast.success('Network removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove network');
    },
  });
}

const DRIVER_OPTIONS = ['bridge', 'overlay', 'macvlan', 'host', 'none'] as const;

const selectCls =
  'h-10 w-full appearance-none rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 pr-9 text-md text-[rgba(255,255,255,0.85)] outline-none transition-colors focus:border-primary/[0.5]';

const driverStyles: Record<string, string> = {
  bridge: 'bg-primary/[0.10] text-primary border-primary/[0.25]',
  overlay: 'bg-primary/[0.08] text-primary/[0.85] border-primary/[0.20]',
  macvlan: 'bg-[rgba(74,222,128,0.08)] text-[rgba(74,222,128,0.85)] border-[rgba(74,222,128,0.20)]',
  host: 'bg-[rgba(250,204,21,0.08)] text-[#facc15] border-[rgba(250,204,21,0.20)]',
  none: 'bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.35)] border-[rgba(255,255,255,0.10)]',
};

function DriverBadge({ driver }: { driver: string }) {
  const cls = driverStyles[driver] ?? 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.55)] border-[rgba(255,255,255,0.14)]';
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {driver}
    </span>
  );
}

function ContainerCountBadge({ network }: { network: DockerNetwork }) {
  const count = network.Containers ? Object.keys(network.Containers).length : 0;
  if (count === 0) return <span className="text-[rgba(255,255,255,0.28)]">0</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] px-2 py-0.5 text-xs font-medium text-[#4ade80]">
      {count}
    </span>
  );
}

export function Networks() {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDriver, setNewDriver] = useState('bridge');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: response, isLoading } = useNetworks(page, pageSize);
  const networks = response?.data;
  const total = response?.total ?? 0;
  const createNetwork = useCreateNetwork();
  const deleteNetwork = useDeleteNetwork();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createNetwork.mutate(
      { name: newName.trim(), driver: newDriver },
      {
        onSuccess: () => {
          setNewName('');
          setNewDriver('bridge');
          setIsCreating(false);
        },
      },
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[rgba(255,255,255,0.92)]">Networks</h1>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Network
          </button>
        )}
      </div>

      {/* Create Network Form */}
      {isCreating && (
        <div className="rounded-2xl border border-white/[0.16] bg-[rgba(255,255,255,0.02)] p-5">
          <h3 className="mb-4 text-md font-medium text-[rgba(255,255,255,0.85)]">Create Network</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="network-name" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
                Network Name
              </label>
              <Input
                id="network-name"
                placeholder="e.g. my-network"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="network-driver" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
                Driver
              </label>
              <div className="relative">
                <select
                  id="network-driver"
                  className={selectCls}
                  value={newDriver}
                  onChange={(e) => setNewDriver(e.target.value)}
                >
                  {DRIVER_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.35)]" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setIsCreating(false); setNewName(''); setNewDriver('bridge'); }}
              className="rounded-xl px-4 py-1.5 text-sm text-[rgba(255,255,255,0.4)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createNetwork.isPending}
              className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {createNetwork.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-primary/[0.08] bg-primary/[0.03]" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && networks?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/[0.15] bg-primary/[0.02] p-12 text-center">
          <Network className="mb-3 h-8 w-8 text-primary opacity-40" />
          <p className="text-sm text-[rgba(255,255,255,0.35)]">No networks found.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && networks && networks.length > 0 && (
        <div className="rounded-2xl border border-white/[0.16] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.14] bg-[rgba(255,255,255,0.02)]">
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Name</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Driver</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Scope</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Created</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Containers</th>
                <th className="px-4 py-3 text-right text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((network) => (
                <tr key={network.Id} className="border-b border-white/[0.18] last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-[rgba(255,255,255,0.85)]">{network.Name}</td>
                  <td className="px-4 py-3">
                    <DriverBadge driver={network.Driver} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.45)]">{network.Scope}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.45)]">{formatDate(network.Created)}</td>
                  <td className="px-4 py-3">
                    <ContainerCountBadge network={network} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deletingId === network.Id ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { deleteNetwork.mutate(network.Id); setDeletingId(null); }}
                          disabled={deleteNetwork.isPending}
                          className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2 py-0.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(network.Id)}
                        className="rounded-lg p-1.5 text-[rgba(255,255,255,0.25)] transition-colors hover:text-[rgba(248,113,113,0.75)]"
                        title="Delete network"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
