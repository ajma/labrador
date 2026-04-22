import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Server } from 'lucide-react';
import { toast } from 'sonner';
import { useProjects } from '../hooks/useProjects';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ContainerStats } from '../hooks/useStats';
import { ProjectCard } from '../components/ProjectCard';
import { api } from '../lib/api';

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjects();
  const ws = useWebSocket();
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
        <h1 className="text-[18px] font-semibold text-[rgba(255,255,255,0.92)]">Dashboard</h1>
        <button
          onClick={() => navigate('/projects/new')}
          className="flex items-center gap-1.5 rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
        >
          <Plus className="h-3.5 w-3.5" />
          New Project
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-[rgba(100,158,245,0.08)] bg-[rgba(100,158,245,0.03)]" />
          ))}
        </div>
      )}

      {!isLoading && projects?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(100,158,245,0.18)] bg-[rgba(100,158,245,0.02)] p-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(100,158,245,0.10)] text-[#649ef5]">
            <Server className="h-6 w-6" />
          </div>
          <p className="text-[14px] font-medium text-[rgba(255,255,255,0.65)]">Nothing deployed yet</p>
          <p className="mt-1 text-[13px] text-[rgba(255,255,255,0.35)]">
            Create a project to start self-hosting.
          </p>
          <button
            onClick={() => navigate('/projects/new')}
            className="mt-5 flex items-center gap-1.5 rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Project
          </button>
        </div>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
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
}
