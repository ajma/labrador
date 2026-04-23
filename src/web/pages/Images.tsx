import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, HardDrive, Search } from 'lucide-react';
import { TablePagination } from '../components/TablePagination';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';

interface DockerImage {
  Id: string;
  RepoTags: string[] | null;
  Size: number;
  Created: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function shortId(id: string): string {
  return id.replace('sha256:', '').slice(0, 12);
}

function ContainerCountBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-[rgba(255,255,255,0.28)]">0</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] px-2 py-0.5 text-xs font-medium text-[#4ade80]">
      {count}
    </span>
  );
}

function getRepoTag(image: DockerImage): string {
  if (!image.RepoTags || image.RepoTags.length === 0) return '<none>';
  return image.RepoTags[0];
}

function useImages() {
  return useQuery<DockerImage[]>({
    queryKey: ['images'],
    queryFn: () => api.get('/docker/images'),
  });
}

function usePullImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post(`/docker/images/${encodeURIComponent(name)}/pull`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      toast.success('Image pulled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pull image');
    },
  });
}

function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/docker/images/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      toast.success('Image removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove image');
    },
  });
}

function usePruneImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ImagesDeleted?: unknown[] }>('/docker/images/prune'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      toast.success(`Pruned ${data?.ImagesDeleted?.length || 0} images`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to prune images');
    },
  });
}

function useContainers() {
  return useQuery<{ Id: string; Image: string; ImageID: string }[]>({
    queryKey: ['containers'],
    queryFn: () => api.get('/docker/containers'),
  });
}

export function Images() {
  const { data: images, isLoading } = useImages();
  const { data: containers } = useContainers();
  const pullImage = usePullImage();
  const deleteImage = useDeleteImage();
  const pruneImages = usePruneImages();

  const usedImageIds = new Set(containers?.flatMap((c) => [c.ImageID, c.Image]) ?? []);
  const containerCountByImage = new Map<string, number>();
  containers?.forEach((c) => {
    containerCountByImage.set(c.ImageID, (containerCountByImage.get(c.ImageID) || 0) + 1);
  });

  const [isPulling, setIsPulling] = useState(false);
  const [pullName, setPullName] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);

  const handlePull = () => {
    if (!pullName.trim()) return;
    pullImage.mutate(pullName.trim(), {
      onSuccess: () => {
        setPullName('');
        setIsPulling(false);
      },
    });
  };

  const filteredImages = images?.filter((image) => {
    if (!filter) return true;
    const tag = getRepoTag(image).toLowerCase();
    const id = shortId(image.Id).toLowerCase();
    const query = filter.toLowerCase();
    return tag.includes(query) || id.includes(query);
  });

  const paginatedImages = filteredImages?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[rgba(255,255,255,0.92)]">Images</h1>
        <div className="flex items-center gap-2">
          {showPruneConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[rgba(255,255,255,0.45)]">Prune unused images?</span>
              <button
                onClick={() => setShowPruneConfirm(false)}
                className="text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
              >
                Cancel
              </button>
              <button
                onClick={() => { pruneImages.mutate(); setShowPruneConfirm(false); }}
                disabled={pruneImages.isPending}
                className="rounded-xl border border-[rgba(248,113,113,0.36)] px-3 py-1.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
              >
                {pruneImages.isPending ? 'Pruning…' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPruneConfirm(true)}
              className="rounded-xl border border-white/[0.14] px-3 py-1.5 text-sm text-[rgba(255,255,255,0.45)] transition-colors hover:border-white/[0.22] hover:text-[rgba(255,255,255,0.7)]"
            >
              Prune Unused
            </button>
          )}
          {!isPulling && (
            <button
              onClick={() => setIsPulling(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              Pull Image
            </button>
          )}
        </div>
      </div>

      {/* Pull Image Form */}
      {isPulling && (
        <div className="rounded-2xl border border-white/[0.16] bg-[rgba(255,255,255,0.02)] p-5">
          <h3 className="mb-4 text-md font-medium text-[rgba(255,255,255,0.85)]">Pull Image</h3>
          <div className="space-y-1.5">
            <label htmlFor="image-name" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
              Image Name
            </label>
            <Input
              id="image-name"
              placeholder="e.g. nginx:latest"
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePull()}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setIsPulling(false); setPullName(''); }}
              className="rounded-xl px-4 py-1.5 text-sm text-[rgba(255,255,255,0.4)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
            >
              Cancel
            </button>
            <button
              onClick={handlePull}
              disabled={!pullName.trim() || pullImage.isPending}
              className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {pullImage.isPending ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        </div>
      )}

      {/* Search Filter */}
      {!isLoading && images && images.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.28)]" />
          <Input
            placeholder="Filter by name or ID…"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            className="pl-10"
          />
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
      {!isLoading && images?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/[0.15] bg-primary/[0.02] p-12 text-center">
          <HardDrive className="mb-3 h-8 w-8 text-primary opacity-40" />
          <p className="text-sm text-[rgba(255,255,255,0.35)]">No images found.</p>
        </div>
      )}

      {/* No filter results */}
      {!isLoading && images && images.length > 0 && filteredImages?.length === 0 && (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/[0.16] p-8">
          <p className="text-sm text-[rgba(255,255,255,0.35)]">No images match your filter.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && filteredImages && filteredImages.length > 0 && (
        <div className="rounded-2xl border border-white/[0.16] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.14] bg-[rgba(255,255,255,0.02)]">
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Repository / Tag</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Image ID</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Size</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Created</th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Containers</th>
                <th className="px-4 py-3 text-right text-2xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedImages!.map((image) => {
                const tag = getRepoTag(image);
                const isNone = tag === '<none>';
                const containerCount = containerCountByImage.get(image.Id) || 0;
                return (
                <tr key={image.Id} className="border-b border-white/[0.18] last:border-0">
                  <td className={`px-4 py-3 text-sm font-medium ${isNone ? 'text-[rgba(255,255,255,0.35)] italic' : 'text-[rgba(255,255,255,0.85)]'}`}>
                    {tag}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[rgba(255,255,255,0.35)]">{shortId(image.Id)}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.45)]">{formatBytes(image.Size)}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.45)]">{formatDate(image.Created)}</td>
                  <td className="px-4 py-3"><ContainerCountBadge count={containerCount} /></td>
                  <td className="px-4 py-3 text-right">
                    {!usedImageIds.has(image.Id) && (
                      deletingId === image.Id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { deleteImage.mutate(image.Id); setDeletingId(null); }}
                            disabled={deleteImage.isPending}
                            className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2 py-0.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(image.Id)}
                          className="rounded-lg p-1.5 text-[rgba(255,255,255,0.25)] transition-colors hover:text-[rgba(248,113,113,0.75)]"
                          title="Delete image"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filteredImages.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
