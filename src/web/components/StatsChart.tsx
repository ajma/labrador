import type { ContainerStats } from '../hooks/useStats';

interface StatsDisplayProps {
  stats: ContainerStats[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function StatsDisplay({ stats }: StatsDisplayProps) {
  if (stats.length === 0) {
    return (
      <p className="text-sm text-[rgba(255,255,255,0.38)]">No stats available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {stats.map((s) => (
        <div
          key={s.containerId}
          className="rounded-xl border border-white/[0.14] bg-[rgba(255,255,255,0.03)] p-3"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm font-medium text-[rgba(255,255,255,0.85)]">{s.name}</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.status === 'running' ? 'bg-[#4ade80]' : 'bg-[rgba(255,255,255,0.25)]'
                }`}
              />
              <span className="text-xs text-[rgba(255,255,255,0.38)]">{s.status}</span>
            </span>
          </div>

          {/* CPU */}
          <div className="mb-1.5">
            <div className="mb-1 flex justify-between text-2xs text-[rgba(255,255,255,0.38)]">
              <span>CPU</span>
              <span>{s.cpuUsage.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(s.cpuUsage, 100)}%` }}
              />
            </div>
          </div>

          {/* Memory */}
          <div className="mb-1.5">
            <div className="mb-1 flex justify-between text-2xs text-[rgba(255,255,255,0.38)]">
              <span>Memory</span>
              <span>{formatBytes(s.memoryUsage)} / {formatBytes(s.memoryLimit)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-1.5 rounded-full bg-primary/[0.55] transition-all"
                style={{
                  width: `${s.memoryLimit > 0 ? Math.min((s.memoryUsage / s.memoryLimit) * 100, 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Network I/O */}
          <div className="flex justify-between text-2xs text-[rgba(255,255,255,0.38)]">
            <span>Net RX: {formatBytes(s.networkRx)}</span>
            <span>Net TX: {formatBytes(s.networkTx)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
