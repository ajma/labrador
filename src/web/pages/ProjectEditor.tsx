import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProject, useCreateProject, useUpdateProject, useDeleteProject, useProjectUpdates, useCheckUpdates } from '../hooks/useProjects';
import { createProjectSchema, updateProjectSchema } from '@shared/schemas';
import type { CreateProjectInput } from '@shared/schemas';
import { useEffect, useState, useCallback } from 'react';
import { ComposeEditor } from '../components/ComposeEditor';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface ExposureProviderOption {
  id: string;
  providerType: string;
  name: string;
  enabled: boolean;
}

interface SettingsResponse {
  exposureProviders: ExposureProviderOption[];
}

interface ExposureStatus {
  active: boolean;
  domain: string;
  message?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ line?: number; message: string }>;
  warnings: Array<{ line?: number; message: string }>;
}

interface LogEntry {
  container: string;
  output: string;
}

interface DeployProgress {
  stage: string;
  message: string;
  timestamp: number;
}

export function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const { data: project, isLoading } = useProject(id ?? '');
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(id ?? '');
  const deleteMutation = useDeleteProject();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeployProgress[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Container update detection
  const { data: containerUpdates, isLoading: updatesLoading } = useProjectUpdates(id ?? '');
  const checkUpdatesMutation = useCheckUpdates(id ?? '');

  // Fetch available exposure providers from settings
  const { data: settingsData } = useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const availableProviders = settingsData?.exposureProviders?.filter((p) => p.enabled) || [];

  // Fetch exposure status for deployed projects
  const { data: exposureStatus } = useQuery<ExposureStatus>({
    queryKey: ['projects', id, 'exposure-status'],
    queryFn: () => api.get(`/projects/${id}/exposure-status`),
    enabled: !!id && project?.status === 'running' && !!project?.exposureEnabled,
  });

  const { subscribe, unsubscribe, on, connected } = useWebSocket();

  // Subscribe to WebSocket events for this project
  useEffect(() => {
    if (!id || !connected) return;
    subscribe(id);

    const offProgress = on('deploy:progress', (msg) => {
      setDeployProgress((prev) => [
        ...prev,
        { stage: msg.stage, message: msg.message, timestamp: Date.now() },
      ]);
    });

    const offComplete = on('deploy:complete', (msg) => {
      if (msg.status === 'success') {
        toast.success('Deployment successful');
      } else {
        toast.error('Deployment failed');
      }
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    const offError = on('deploy:error', (msg) => {
      toast.error(`Deploy error: ${msg.error}`);
    });

    return () => {
      unsubscribe(id);
      offProgress();
      offComplete();
      offError();
    };
  }, [id, connected, subscribe, unsubscribe, on, queryClient]);

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/deploy`),
    onMutate: () => {
      setDeployProgress([]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Deploy failed');
    },
  });

  // Stop mutation
  const stopMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/stop`),
    onSuccess: () => {
      toast.success('Project stopped');
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Stop failed');
    },
  });

  // Restart mutation
  const restartMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/restart`),
    onSuccess: () => {
      toast.success('Project restarted');
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Restart failed');
    },
  });

  // Logs query
  const logsQuery = useQuery<{ logs: LogEntry[] }>({
    queryKey: ['projects', id, 'logs'],
    queryFn: () => api.get(`/projects/${id}/logs?tail=100`),
    enabled: showLogs && !!id,
    refetchInterval: showLogs ? 10000 : false,
  });

  const [subdomainPrefix, setSubdomainPrefix] = useState('');
  const [baseDomain, setBaseDomain] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(isEditing ? updateProjectSchema : createProjectSchema),
    defaultValues: {
      name: '',
      composeContent: '',
      logoUrl: null,
      domainName: null,
      exposureEnabled: false,
      exposureProviderId: null,
      exposureConfig: {},
    },
  });

  // Populate form when project data loads
  useEffect(() => {
    if (project) {
      const expConfig =
        typeof project.exposureConfig === 'string'
          ? JSON.parse(project.exposureConfig || '{}')
          : project.exposureConfig || {};

      // Parse domainName into subdomain prefix and base domain
      if (project.domainName) {
        const parts = project.domainName.split('.');
        if (parts.length >= 2) {
          setSubdomainPrefix(parts[0]);
          setBaseDomain(parts.slice(1).join('.'));
        } else {
          setSubdomainPrefix('');
          setBaseDomain(project.domainName);
        }
      }

      reset({
        name: project.name,
        composeContent: project.composeContent,
        logoUrl: project.logoUrl || null,
        domainName: project.domainName || null,
        exposureEnabled: project.exposureEnabled ?? false,
        exposureProviderId: project.exposureProviderId || null,
        exposureConfig: expConfig,
      });
    }
  }, [project, reset]);

  const composeContent = watch('composeContent');
  const exposureEnabled = watch('exposureEnabled');
  const selectedProviderId = watch('exposureProviderId');

  const { data: availableDomains = [] } = useQuery<string[]>({
    queryKey: ['provider-domains', selectedProviderId],
    queryFn: () => api.get(`/settings/exposure-providers/${selectedProviderId}/domains`),
    enabled: !!selectedProviderId && exposureEnabled,
  });

  const handleComposeChange = useCallback(
    (value: string) => {
      setValue('composeContent', value, { shouldDirty: true });
    },
    [setValue],
  );

  // Debounced validation of compose content
  useEffect(() => {
    if (!composeContent || composeContent.trim().length === 0) {
      setValidation(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await api.post<ValidationResult>('/projects/compose/validate', { content: composeContent });
        setValidation(result);
      } catch {
        // Silently ignore validation request failures
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [composeContent]);

  const onSubmit = async (data: CreateProjectInput) => {
    try {
      // Combine subdomain prefix and base domain
      const fullDomain = subdomainPrefix && baseDomain
        ? `${subdomainPrefix}.${baseDomain}`
        : null;

      const submitData = {
        ...data,
        domainName: fullDomain,
      };

      if (isEditing) {
        await updateMutation.mutateAsync(submitData);
        toast.success('Project updated');
      } else {
        await createMutation.mutateAsync(submitData);
        toast.success('Project created');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleSaveAndDeploy = async () => {
    const data = watch();
    try {
      const fullDomain = subdomainPrefix && baseDomain
        ? `${subdomainPrefix}.${baseDomain}`
        : null;

      const submitData = {
        ...data,
        domainName: fullDomain,
      };

      await updateMutation.mutateAsync(submitData);
      toast.success('Changes saved');
      await deployMutation.mutateAsync();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save and deploy');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Project deleted');
      setShowDeleteConfirm(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project');
      setShowDeleteConfirm(false);
    }
  };

  const isDeploying = deployMutation.isPending || project?.status === 'starting';
  const isRunning = project?.status === 'running';
  const isStopped = project?.status === 'stopped';

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

  const statusColor =
    project?.status === 'running'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : project?.status === 'error'
        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        : project?.status === 'starting'
          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
          : 'bg-muted text-muted-foreground';

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">{isEditing ? 'Edit Project' : 'New Project'}</h2>
        {isEditing && (
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
              {project?.status}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Project Settings */}
        <div className="space-y-6">
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

          {/* Exposure */}
          <div className="space-y-4 rounded-lg border border-input p-4">
            <h3 className="text-sm font-semibold">Exposure</h3>

            <div className="flex items-center gap-3">
              <input
                id="exposureEnabled"
                type="checkbox"
                {...register('exposureEnabled')}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="exposureEnabled" className="text-sm font-medium">
                Enable external exposure
              </label>
            </div>

            {exposureEnabled && (
              <div className="space-y-4 pl-7">
                <div className="space-y-2">
                  <label htmlFor="exposureProviderId" className="text-sm font-medium">
                    Exposure Provider
                  </label>
                  <select
                    id="exposureProviderId"
                    {...register('exposureProviderId')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a provider...</option>
                    {availableProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.providerType})
                      </option>
                    ))}
                  </select>
                  {availableProviders.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No providers configured. Add one in Settings.
                    </p>
                  )}
                </div>

                {/* Domain Configuration */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Domain <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={subdomainPrefix}
                      onChange={(e) => setSubdomainPrefix(e.target.value)}
                      placeholder="myapp"
                      className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-muted-foreground">.</span>
                    {availableDomains.length > 0 ? (
                      <select
                        value={baseDomain}
                        onChange={(e) => setBaseDomain(e.target.value)}
                        className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Select domain...</option>
                        {availableDomains.map((domain: string) => (
                          <option key={domain} value={domain}>
                            {domain}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={baseDomain}
                        onChange={(e) => setBaseDomain(e.target.value)}
                        placeholder="example.com"
                        className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The domain where your app will be accessible (e.g., myapp.example.com)
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="exposurePort" className="text-sm font-medium">
                    Target Port
                  </label>
                  <input
                    id="exposurePort"
                    type="number"
                    defaultValue={
                      (typeof project?.exposureConfig === 'string'
                        ? JSON.parse(project?.exposureConfig || '{}')
                        : project?.exposureConfig
                      )?.port || 80
                    }
                    onChange={(e) => {
                      const current = watch('exposureConfig') || {};
                      setValue('exposureConfig', { ...current, port: parseInt(e.target.value, 10) || 80 });
                    }}
                    placeholder="80"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    The port your service listens on inside the container.
                  </p>
                </div>

                {/* Show exposure status for running projects */}
                {isEditing && project?.status === 'running' && exposureStatus && (
                  <div
                    className={`rounded-md p-3 text-sm ${
                      exposureStatus.active
                        ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">
                      {exposureStatus.active ? 'Route active' : 'Route inactive'}
                    </span>
                    {exposureStatus.domain && (
                      <span className="ml-2">({exposureStatus.domain})</span>
                    )}
                    {exposureStatus.message && (
                      <p className="mt-1 text-xs">{exposureStatus.message}</p>
                    )}
                  </div>
                )}
              </div>
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
        </div>

        {/* Right Column - Docker Compose */}
        <div className="space-y-6">
          {/* Deployment controls */}
          {isEditing && project && (
            <div className="rounded-lg border border-input p-4">
              <h3 className="mb-3 text-sm font-semibold">Deployment</h3>
              <div className="flex items-center gap-3 flex-wrap">
                {(isStopped || project.status === 'error') && (
                  <button
                    type="button"
                    onClick={() => deployMutation.mutate()}
                    disabled={isDeploying}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isDeploying ? 'Deploying...' : 'Deploy'}
                  </button>
                )}
                {isRunning && (
                  <>
                    {isDirty && (
                      <button
                        type="button"
                        onClick={handleSaveAndDeploy}
                        disabled={isDeploying || updateMutation.isPending}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {updateMutation.isPending || isDeploying ? 'Deploying...' : 'Save & Redeploy'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {stopMutation.isPending ? 'Stopping...' : 'Stop'}
                    </button>
                    <button
                      type="button"
                      onClick={() => restartMutation.mutate()}
                      disabled={restartMutation.isPending}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {restartMutation.isPending ? 'Restarting...' : 'Restart'}
                    </button>
                  </>
                )}
                {isDeploying && (
                  <span className="text-sm text-muted-foreground">
                    Deployment in progress...
                  </span>
                )}
              </div>

              {/* Deployment progress messages */}
              {deployProgress.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded border border-input bg-muted/50 p-3">
                  <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Progress</h4>
                  {deployProgress.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 font-mono text-muted-foreground">
                        [{p.stage}]
                      </span>
                      <span>{p.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Docker Compose
            </label>
            <ComposeEditor
              value={composeContent ?? ''}
              onChange={handleComposeChange}
              errors={validation?.errors}
              warnings={validation?.warnings}
            />
            {errors.composeContent && (
              <p className="text-sm text-destructive">{errors.composeContent.message}</p>
            )}
          </div>
        </div>
      </form>

      {/* Logs section */}
      {isEditing && project && (
        <div className="mt-8 rounded-lg border border-input">
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className="flex w-full items-center justify-between p-4 text-sm font-semibold hover:bg-muted/50"
          >
            <span>Container Logs</span>
            <span className="text-muted-foreground">{showLogs ? 'Hide' : 'Show'}</span>
          </button>
          {showLogs && (
            <div className="border-t border-input p-4">
              {logsQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading logs...</p>
              )}
              {logsQuery.data?.logs && logsQuery.data.logs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No logs available. Deploy the project first.
                </p>
              )}
              {logsQuery.data?.logs?.map((entry, i) => (
                <div key={i} className="mb-4">
                  <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                    {entry.container}
                  </h4>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">
                    {entry.output || '(no output)'}
                  </pre>
                </div>
              ))}
              {logsQuery.data?.logs && logsQuery.data.logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => logsQuery.refetch()}
                  disabled={logsQuery.isFetching}
                  className="mt-2 rounded border border-input px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {logsQuery.isFetching ? 'Refreshing...' : 'Refresh Logs'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Container Updates section */}
      {isEditing && project && (
        <div className="mt-8 rounded-lg border border-input">
          <div className="flex items-center justify-between p-4">
            <h3 className="text-sm font-semibold">Container Updates</h3>
            <button
              type="button"
              onClick={() => checkUpdatesMutation.mutate()}
              disabled={checkUpdatesMutation.isPending}
              className="rounded border border-input px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {checkUpdatesMutation.isPending ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
          <div className="border-t border-input p-4">
            {updatesLoading && (
              <p className="text-sm text-muted-foreground">Loading update info...</p>
            )}
            {!updatesLoading && (!containerUpdates || containerUpdates.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No update information available. Click &quot;Check for Updates&quot; to scan.
              </p>
            )}
            {containerUpdates && containerUpdates.length > 0 && (
              <div className="space-y-3">
                {containerUpdates.map((update) => (
                  <div
                    key={update.id}
                    className={`rounded-md p-3 text-sm ${
                      update.updateAvailable
                        ? 'bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
                        : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{update.containerName}</span>
                      {update.updateAvailable ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Update Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          Up to date
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>
                        <span className="font-medium">Image:</span>{' '}
                        <code className="rounded bg-muted px-1 py-0.5">{update.currentImage}</code>
                      </p>
                      {update.updateAvailable && update.latestImage !== update.currentImage && (
                        <p>
                          <span className="font-medium">Latest digest:</span>{' '}
                          <code className="rounded bg-muted px-1 py-0.5">
                            {update.latestImage.slice(0, 24)}...
                          </code>
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Last checked:</span>{' '}
                        {new Date(update.checkedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
