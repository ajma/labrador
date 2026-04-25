import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Database } from "lucide-react";
import { TablePagination } from "../components/TablePagination";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";

interface DockerVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  CreatedAt?: string;
  Scope: string;
  ContainerCount: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function useVolumes(page: number, pageSize: number) {
  return useQuery<{ data: DockerVolume[]; total: number }>({
    queryKey: ["volumes", page, pageSize],
    queryFn: () => api.get(`/docker/volumes?page=${page}&pageSize=${pageSize}`),
  });
}

function useCreateVolume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; driver?: string }) =>
      api.post("/docker/volumes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes"] });
      toast.success("Volume created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create volume");
    },
  });
}

function useDeleteVolume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.delete(`/docker/volumes/${encodeURIComponent(name)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes"] });
      toast.success("Volume removed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove volume");
    },
  });
}

function ContainerCountBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] px-2 py-0.5 text-xs font-medium text-[#4ade80]">
      {count}
    </span>
  );
}

function DriverBadge({ driver }: { driver: string }) {
  const cls =
    driver === "local"
      ? "bg-primary/[0.10] text-primary border-primary/[0.25]"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {driver}
    </span>
  );
}

export function Volumes() {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("local");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const { data: response, isLoading } = useVolumes(page, pageSize);
  const volumes = response?.data;
  const total = response?.total ?? 0;
  const createVolume = useCreateVolume();
  const deleteVolume = useDeleteVolume();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createVolume.mutate(
      { name: newName.trim(), driver: newDriver.trim() || "local" },
      {
        onSuccess: () => {
          setNewName("");
          setNewDriver("local");
          setIsCreating(false);
        },
      },
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Volumes</h1>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Volume
          </button>
        )}
      </div>

      {/* Create Volume Form */}
      {isCreating && (
        <div className="rounded-2xl border border-white/[0.22] bg-accent/50 p-5">
          <h3 className="mb-4 text-md font-medium text-foreground">
            Create Volume
          </h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="volume-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Volume Name
              </label>
              <Input
                id="volume-name"
                placeholder="e.g. my-data"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="volume-driver"
                className="text-xs font-medium text-muted-foreground"
              >
                Driver
              </label>
              <Input
                id="volume-driver"
                placeholder="local"
                value={newDriver}
                onChange={(e) => setNewDriver(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setIsCreating(false);
                setNewName("");
                setNewDriver("local");
              }}
              className="rounded-xl px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createVolume.isPending}
              className="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {createVolume.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-primary/[0.08] bg-primary/[0.03]"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && volumes?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/[0.15] bg-primary/[0.02] p-12 text-center">
          <Database className="mb-3 h-8 w-8 text-primary opacity-40" />
          <p className="text-sm text-muted-foreground">No volumes found.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && volumes && volumes.length > 0 && (
        <div className="rounded-2xl border border-white/[0.22] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.20] bg-accent/50">
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Driver
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Mountpoint
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Containers
                </th>
                <th className="px-4 py-3 text-right text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((volume) => (
                <tr
                  key={volume.Name}
                  className="border-b border-white/[0.24] last:border-0"
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {volume.Name}
                  </td>
                  <td className="px-4 py-3">
                    <DriverBadge driver={volume.Driver} />
                  </td>
                  <td
                    className="max-w-[240px] truncate px-4 py-3 font-mono text-xs text-muted-foreground"
                    title={volume.Mountpoint}
                  >
                    {volume.Mountpoint}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {volume.CreatedAt ? formatDate(volume.CreatedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ContainerCountBadge count={volume.ContainerCount} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deletingName === volume.Name ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setDeletingName(null)}
                          className="text-xs text-muted-foreground transition-colors hover:text-muted-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            deleteVolume.mutate(volume.Name);
                            setDeletingName(null);
                          }}
                          disabled={deleteVolume.isPending}
                          className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2 py-0.5 text-xs text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingName(volume.Name)}
                        className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:text-[rgba(248,113,113,0.75)]"
                        title="Delete volume"
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
