import { useNavigate } from 'react-router-dom';
import { Play, Square, RotateCcw, ExternalLink, Globe } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import type { Project } from '@shared/types';

interface ProjectCardProps {
  project: Project;
  onDeploy: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
}

const statusConfig: Record<Project['status'], { color: string; label: string }> = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-gray-400', label: 'Stopped' },
  starting: { color: 'bg-yellow-500 animate-pulse', label: 'Starting' },
  error: { color: 'bg-red-500', label: 'Error' },
};

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ProjectCard({ project, onDeploy, onStop, onRestart }: ProjectCardProps) {
  const navigate = useNavigate();
  const status = statusConfig[project.status];

  const handleCardClick = () => {
    navigate(`/projects/${project.id}`);
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {project.logoUrl && (
              <img
                src={project.logoUrl}
                alt={`${project.name} logo`}
                className="h-8 w-8 shrink-0 rounded object-contain"
              />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">
                {project.name}
              </h3>
              {project.domainName && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{project.domainName}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
            <span className="text-xs text-muted-foreground">{status.label}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground">
          Last deployed: {timeAgo(project.deployedAt)}
        </p>
      </CardContent>

      <CardFooter className="gap-2">
        {(project.status === 'stopped' || project.status === 'error') && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDeploy(project.id);
            }}
            title="Deploy"
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            Deploy
          </Button>
        )}
        {project.status === 'running' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStop(project.id);
              }}
              title="Stop"
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRestart(project.id);
              }}
              title="Restart"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Restart
            </Button>
          </>
        )}
        {project.status === 'starting' && (
          <span className="text-xs text-muted-foreground">Deploying...</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/projects/${project.id}`);
          }}
          title="Open project editor"
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          Open
        </Button>
      </CardFooter>
    </Card>
  );
}
