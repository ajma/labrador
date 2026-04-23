import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Server, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useProjects } from '../hooks/useProjects';
import { useGroups } from '../hooks/useGroups';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAdoptable } from '../hooks/useAdoptable';
import type { ContainerStats } from '../hooks/useStats';
import { ProjectCard } from '../components/ProjectCard';
import { AdoptableStacksList } from '../components/AdoptableStacksList';
import { api } from '../lib/api';

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjects();
  const { data: groups = [] } = useGroups();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const ws = useWebSocket();

  const allCollapsed = groups.length > 0 && collapsedGroups.size === groups.length;

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) setCollapsedGroups(new Set());
    else setCollapsedGroups(new Set(groups.map((g) => g.id)));
  };

  const sortedProjects = [...(projects ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = sortedProjects.filter((p) => p.groupId === null);
  const groupedSections = groups.map((g) => ({
    group: g,
    projects: sortedProjects.filter((p) => p.groupId === g.id),
  }));
  const { data: adoptable } = useAdoptable();
  const [projectStats, setProjectStats] = useState<Map<string, ContainerStats[]>>(new Map());

  useEffect(() => {
    if (!ws.connected || !projects) return;

    const runningProjects = projects.filter((p) => p.status === 'running');
    for (const project of runningProjects) {
      ws.subscribe(project.id);
    }

    const cleanup = ws.on('stats:update', (msg) => {
      const pid = msg.projectId;
      if (pid && msg.containers) {
        setProjectStats((prev) => {
          const next = new Map(prev);
          next.set(pid, msg.containers);
          return next;
        });
      }
    });

    return () => {
      for (const project of runningProjects) {
        ws.unsubscribe(project.id);
      }
      cleanup();
    };
  }, [ws.connected, projects]);

  const deployMutation = useMutation({
    mutationFn: (id: string) => api.post(`/projects/${id}/deploy`),
    onSuccess: () => {
      toast.success('Deployment started');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Deploy failed');
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/projects/${id}/stop`),
    onSuccess: () => {
      toast.success('Project stopped');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Stop failed');
    },
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => api.post(`/projects/${id}/restart`),
    onSuccess: () => {
      toast.success('Project restarted');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Restart failed');
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <button
          onClick={() => navigate('/projects/new')}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Project
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-primary/[0.08] bg-primary/[0.03]" />
          ))}
        </div>
      )}

      {!isLoading && projects?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/[0.18] bg-primary/[0.02] p-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.10] text-primary">
            <Server className="h-6 w-6" />
          </div>
          <p className="text-md font-medium text-muted-foreground">Nothing deployed yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project to start self-hosting.
          </p>
          {adoptable && adoptable.length > 0 ? (
            <div className="mt-6 w-full max-w-sm text-left">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                Or adopt an existing stack:
              </p>
              <AdoptableStacksList stacks={adoptable} />
            </div>
          ) : (
            <button
              onClick={() => navigate('/projects/new')}
              className="mt-5 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Project
            </button>
          )}
        </div>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className="space-y-8">
          {groups.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={toggleAll}
                className="text-xs text-muted-foreground transition-colors hover:text-muted-foreground"
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
          )}

          {ungrouped.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ungrouped.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  stats={projectStats.get(project.id)}
                  onDeploy={(id) => deployMutation.mutate(id)}
                  onStop={(id) => stopMutation.mutate(id)}
                  onRestart={(id) => restartMutation.mutate(id)}
                />
              ))}
            </div>
          )}

          {groupedSections.map(({ group, projects: gProjects }) => {
            if (gProjects.length === 0) return null;
            const collapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 mb-4"
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.name}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </button>
                {!collapsed && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {gProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        stats={projectStats.get(project.id)}
                        onDeploy={(id) => deployMutation.mutate(id)}
                        onStop={(id) => stopMutation.mutate(id)}
                        onRestart={(id) => restartMutation.mutate(id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
