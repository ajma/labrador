import { useNavigate } from 'react-router-dom';
import { Play, Square, RotateCcw, ExternalLink, Globe, ArrowUpCircle } from 'lucide-react';
import type { Project } from '@shared/types';
import { useProjectUpdates } from '../hooks/useProjects';
import type { ContainerStats } from '../hooks/useStats';

interface ProjectCardProps {
  project: Project;
  stats?: ContainerStats[];
  onDeploy: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const statusConfig: Record<Project['status'], { dot: string; label: string; labelColor: string; cardBorder: string; cardBg: string; cardHover: string }> = {
  running: {
    dot: 'bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.45)]',
    label: 'Running',
    labelColor: 'text-[rgba(74,222,128,0.9)]',
    cardBorder: 'border-[rgba(74,222,128,0.18)]',
    cardBg: 'bg-[rgba(74,222,128,0.02)]',
    cardHover: 'hover:bg-[rgba(74,222,128,0.04)]',
  },
  stopped: {
    dot: 'bg-[rgba(255,255,255,0.20)]',
    label: 'Stopped',
    labelColor: 'text-[rgba(255,255,255,0.35)]',
    cardBorder: 'border-white/[0.14]',
    cardBg: 'bg-[rgba(255,255,255,0.025)]',
    cardHover: 'hover:bg-[rgba(255,255,255,0.04)]',
  },
  starting: {
    dot: 'bg-[#facc15] animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.4)]',
    label: 'Starting',
    labelColor: 'text-[#facc15]',
    cardBorder: 'border-[rgba(250,204,21,0.20)]',
    cardBg: 'bg-[rgba(250,204,21,0.015)]',
    cardHover: 'hover:bg-[rgba(250,204,21,0.03)]',
  },
  error: {
    dot: 'bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,0.45)]',
    label: 'Error',
    labelColor: 'text-[#f87171]',
    cardBorder: 'border-[rgba(248,113,113,0.20)]',
    cardBg: 'bg-[rgba(248,113,113,0.02)]',
    cardHover: 'hover:bg-[rgba(248,113,113,0.04)]',
  },
};

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ProjectCard({ project, stats, onDeploy, onStop, onRestart }: ProjectCardProps) {
  const navigate = useNavigate();
  const status = statusConfig[project.status];
  const { data: updates } = useProjectUpdates(project.id);
  const hasUpdates = updates?.some((u) => u.updateAvailable) ?? false;

  return (
    <div
      className={`flex cursor-pointer flex-col rounded-2xl border transition-colors ${status.cardBorder} ${status.cardBg} ${status.cardHover}`}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {project.logoUrl && (
            <img
              src={project.logoUrl}
              alt={`${project.name} logo`}
              className="h-8 w-8 shrink-0 rounded object-contain"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-md font-semibold text-[rgba(255,255,255,0.88)]">
              {project.name}
            </h3>
            {project.domainName && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-[rgba(255,255,255,0.35)]">
                <Globe className="h-3 w-3 shrink-0" />
                <a
                  href={`https://${project.domainName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {project.domainName}
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {hasUpdates && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.10)] px-2 py-0.5 text-2xs font-medium text-[#facc15]">
              <ArrowUpCircle className="h-3 w-3" />
              Update
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            <span className={`text-xs ${status.labelColor}`}>{status.label}</span>
          </div>
        </div>
      </div>

      {/* Stats / Last deployed */}
      <div className="px-4 pb-3">
        <p className="text-xs text-[rgba(255,255,255,0.35)]">
          Last deployed: {timeAgo(project.deployedAt)}
        </p>

        {project.status === 'running' && stats && stats.length > 0 && (() => {
          const totalCpu = stats.reduce((sum, s) => sum + s.cpuUsage, 0);
          const totalMem = stats.reduce((sum, s) => sum + s.memoryUsage, 0);
          const totalMemLimit = stats.reduce((sum, s) => sum + s.memoryLimit, 0);
          const cpuColor = totalCpu > 80 ? '#f87171' : totalCpu > 50 ? '#facc15' : '#4ade80';
          return (
            <div className="mt-2 space-y-1.5">
              <div>
                <div className="mb-0.5 flex justify-between text-2xs text-[rgba(255,255,255,0.35)]">
                  <span>CPU</span>
                  <span>{totalCpu.toFixed(1)}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{ width: `${Math.min(totalCpu, 100)}%`, backgroundColor: cpuColor }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-2xs text-[rgba(255,255,255,0.35)]">
                <span>Memory</span>
                <span>{formatBytes(totalMem)} / {formatBytes(totalMemLimit)}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Footer actions */}
      <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.18] px-4 py-2.5">
        {(project.status === 'stopped' || project.status === 'error') && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeploy(project.id); }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#4ade80] transition-colors hover:bg-[rgba(74,222,128,0.08)]"
          >
            <Play className="h-3 w-3" />
            Deploy
          </button>
        )}
        {project.status === 'running' && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onStop(project.id); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.45)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.75)]"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRestart(project.id); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.45)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.75)]"
            >
              <RotateCcw className="h-3 w-3" />
              Restart
            </button>
          </>
        )}
        {project.status === 'starting' && (
          <span className="text-xs text-[#facc15]">Deploying…</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
          className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.65)]"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </button>
      </div>
    </div>
  );
}
