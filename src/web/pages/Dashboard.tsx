import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/ProjectCard';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjects();

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
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <Button onClick={() => navigate('/projects/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border bg-muted"
            />
          ))}
        </div>
      )}

      {!isLoading && projects?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No projects yet. Create your first project to get started.
          </p>
          <Button className="mt-4" onClick={() => navigate('/projects/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </div>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
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
