import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useProject, useCreateProject, useUpdateProject, useDeleteProject } from '../hooks/useProjects';
import { createProjectSchema, updateProjectSchema } from '@shared/schemas';
import type { CreateProjectInput } from '@shared/schemas';
import { useEffect, useState } from 'react';

export function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const { data: project, isLoading } = useProject(id ?? '');
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(id ?? '');
  const deleteMutation = useDeleteProject();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(isEditing ? updateProjectSchema : createProjectSchema),
    defaultValues: {
      name: '',
      composeContent: '',
      logoUrl: null,
      domainName: null,
    },
  });

  // Populate form when project data loads
  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        composeContent: project.composeContent,
        logoUrl: project.logoUrl || null,
        domainName: project.domainName || null,
      });
    }
  }, [project, reset]);

  const onSubmit = async (data: CreateProjectInput) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync(data);
        toast.success('Project updated');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('Project created');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Project deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project');
    }
  };

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (isEditing && !isLoading && !project) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold">Project not found</h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">{isEditing ? 'Edit Project' : 'New Project'}</h2>
        {isEditing && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {project?.status}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Project Name
          </label>
          <input
            id="name"
            type="text"
            {...register('name')}
            placeholder="My Awesome Project"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        {/* Compose Content */}
        <div className="space-y-2">
          <label htmlFor="composeContent" className="text-sm font-medium">
            Docker Compose
          </label>
          <textarea
            id="composeContent"
            {...register('composeContent')}
            rows={16}
            placeholder={`version: "3"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"`}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.composeContent && (
            <p className="text-sm text-destructive">{errors.composeContent.message}</p>
          )}
        </div>

        {/* Logo URL */}
        <div className="space-y-2">
          <label htmlFor="logoUrl" className="text-sm font-medium">
            Logo URL <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="logoUrl"
            type="text"
            {...register('logoUrl')}
            placeholder="https://example.com/logo.png"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.logoUrl && <p className="text-sm text-destructive">{errors.logoUrl.message}</p>}
        </div>

        {/* Domain Name */}
        <div className="space-y-2">
          <label htmlFor="domainName" className="text-sm font-medium">
            Domain Name <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="domainName"
            type="text"
            {...register('domainName')}
            placeholder="app.example.com"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {errors.domainName && (
            <p className="text-sm text-destructive">{errors.domainName.message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </button>
          )}
        </div>
      </form>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete Project</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete &quot;{project?.name}&quot;? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
