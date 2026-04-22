import { useParams, useNavigate } from 'react-router-dom';
import { Globe, ChevronDown, ExternalLink, X, RefreshCw, ScrollText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProject, useCreateProject, useUpdateProject, useDeleteProject, useProjectUpdates, useCheckUpdates } from '../hooks/useProjects';
import { createProjectSchema, updateProjectSchema } from '@shared/schemas';
import type { CreateProjectInput } from '@shared/schemas';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { load } from 'js-yaml';
import { ComposeEditor } from '../components/ComposeEditor';
import { TemplatePickerModal } from '../components/TemplatePickerModal';
import { AdoptStacksDialog } from '../components/AdoptStacksDialog';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAdoptable } from '../hooks/useAdoptable';
import type { ProjectTemplate } from '@shared/types';

interface ExposureProviderOption {
  id: string;
  providerType: string;
  name: string;
  enabled: boolean;
}

interface SettingsResponse {
  exposureProviders: ExposureProviderOption[];
  defaultExposureProviderId: string | null;
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

export function parsePort(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
  return parsed;
}

export function extractTargetPortFromEntry(entry: unknown): number | null {
  if (typeof entry === 'string') {
    const withoutProtocol = entry.split('/')[0]?.trim() ?? '';
    if (!withoutProtocol) return null;
    const parts = withoutProtocol.split(':').map((part) => part.trim()).filter(Boolean);
    const targetPart = parts[parts.length - 1];
    return parsePort(targetPart);
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const candidate = (entry as Record<string, unknown>).target ?? (entry as Record<string, unknown>).port;
    return parsePort(candidate);
  }
  return null;
}

export function extractComposeTargetPorts(composeContent: string): number[] {
  if (!composeContent.trim()) return [];
  try {
    const parsed = load(composeContent);
    if (!parsed || typeof parsed !== 'object') return [];
    const services = (parsed as { services?: Record<string, { ports?: unknown[] }> }).services;
    if (!services || typeof services !== 'object') return [];
    const ports = new Set<number>();
    for (const service of Object.values(services)) {
      if (!Array.isArray(service?.ports)) continue;
      for (const entry of service.ports) {
        const targetPort = extractTargetPortFromEntry(entry);
        if (targetPort !== null) ports.add(targetPort);
      }
    }
    return Array.from(ports).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function extractComposeProjectName(composeContent: string): string | null {
  if (!composeContent.trim()) return null;
  try {
    const parsed = load(composeContent);
    if (!parsed || typeof parsed !== 'object') return null;
    const services = (parsed as { services?: Record<string, unknown> }).services;
    if (!services || typeof services !== 'object') return null;
    const firstName = Object.keys(services)[0];
    return firstName ? firstName : null;
  } catch {
    return null;
  }
}

export function extractFirstComposeTargetPort(composeContent: string): number | null {
  if (!composeContent.trim()) return null;
  try {
    const parsed = load(composeContent);
    if (!parsed || typeof parsed !== 'object') return null;
    const services = (parsed as { services?: Record<string, { ports?: unknown[] }> }).services;
    if (!services || typeof services !== 'object') return null;
    for (const service of Object.values(services)) {
      if (!Array.isArray(service?.ports)) continue;
      for (const entry of service.ports) {
        const port = extractTargetPortFromEntry(entry);
        if (port !== null) return port;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const emptyProjectFormValues: CreateProjectInput = {
  name: '',
  composeContent: '',
  logoUrl: null,
  domainName: null,
  exposureEnabled: false,
  exposureProviderId: null,
  exposureConfig: {},
  isInfrastructure: false,
};

const inputCls =
  'flex h-10 w-full rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[14px] text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.28)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)] disabled:cursor-not-allowed disabled:opacity-50';

const selectCls =
  'h-10 w-full appearance-none rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 pr-9 text-[14px] text-[rgba(255,255,255,0.85)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)]';

const statusStyles: Record<string, string> = {
  running: 'bg-[rgba(74,222,128,0.12)] text-[#4ade80] border-[rgba(74,222,128,0.25)]',
  stopped: 'bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.38)] border-[rgba(255,255,255,0.08)]',
  starting: 'bg-[rgba(250,204,21,0.10)] text-[#facc15] border-[rgba(250,204,21,0.25)]',
  error: 'bg-[rgba(127,29,29,0.20)] text-[rgba(254,202,202,0.92)] border-[rgba(248,113,113,0.36)]',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? 'bg-[#649ef5]' : 'bg-[rgba(255,255,255,0.14)]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

function LogsModal({
  logs,
  isLoading,
  isFetching,
  onRefresh,
  onClose,
  projectName,
}: {
  logs: LogEntry[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onClose: () => void;
  projectName: string;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex h-[94vh] w-full max-w-6xl flex-col rounded-2xl border border-white/[0.12] bg-[rgba(9,14,25,0.97)] shadow-2xl">

        {/* Modal header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ScrollText className="h-4 w-4 text-[rgba(255,255,255,0.30)]" />
            <h2 className="font-rubik text-[14px] font-semibold text-[rgba(255,255,255,0.88)]">
              Container Logs
              {projectName && (
                <span className="ml-2 font-normal text-[rgba(255,255,255,0.35)]">— {projectName}</span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] text-[rgba(255,255,255,0.45)] transition-colors hover:border-white/[0.22] hover:text-[rgba(255,255,255,0.7)] disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(255,255,255,0.65)]"
              aria-label="Close logs"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="flex min-h-0 flex-1 flex-col p-6">
          {isLoading && (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
                  <div className="h-32 animate-pulse rounded-xl bg-[rgba(255,255,255,0.03)]" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && (!logs || logs.length === 0) && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <ScrollText className="mb-3 h-8 w-8 text-[rgba(255,255,255,0.12)]" />
              <p className="text-[14px] text-[rgba(255,255,255,0.38)]">No logs yet.</p>
              <p className="mt-1 text-[13px] text-[rgba(255,255,255,0.22)]">
                Deploy the project first to see container output.
              </p>
            </div>
          )}

          {logs && logs.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {logs.map((entry, i) => (
                <div key={i} className="flex min-h-0 flex-1 flex-col">
                  <p className="mb-2 shrink-0 font-rubik text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(255,255,255,0.28)]">
                    {entry.container}
                  </p>
                  <pre className="min-h-0 flex-1 overflow-auto rounded-xl bg-[rgba(4,7,15,0.78)] p-4 font-mono text-[12px] leading-relaxed text-[rgba(255,255,255,0.70)]">
                    {entry.output || '(no output)'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const isCreate = !id;

  const { data: adoptable } = useAdoptable();
  const [adoptDialogOpen, setAdoptDialogOpen] = useState(false);

  const { data: project, isLoading } = useProject(id ?? '');
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(id ?? '');
  const deleteMutation = useDeleteProject();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeployProgress[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [domainErrors, setDomainErrors] = useState<{ subdomain?: string; domain?: string }>({});
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  function handleTemplateSelect(template: ProjectTemplate) {
    setValue('name', template.name);
    setValue('composeContent', template.composeContent);
    if (template.logoUrl) setValue('logoUrl', template.logoUrl);
    const ports = extractComposeTargetPorts(template.composeContent);
    if (ports.length > 0) {
      const slug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      setSubdomainPrefix(slug);
      setValue('exposureEnabled', true);
      setValue('exposureConfig', { port: ports[0] });
    }
    setShowTemplatePicker(false);
  }

  const { data: containerUpdates } = useProjectUpdates(id ?? '');
  const checkUpdatesMutation = useCheckUpdates(id ?? '');

  const { data: settingsData } = useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const availableProviders = settingsData?.exposureProviders?.filter((p) => p.enabled) || [];

  const { data: exposureStatus } = useQuery<ExposureStatus>({
    queryKey: ['projects', id, 'exposure-status'],
    queryFn: () => api.get(`/projects/${id}/exposure-status`),
    enabled: !!id && project?.status === 'running' && !!project?.exposureEnabled,
  });

  const { subscribe, unsubscribe, on, connected } = useWebSocket();

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

  const deployMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/deploy`),
    onMutate: () => { setDeployProgress([]); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => { toast.error(error.message || 'Deploy failed'); },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/stop`),
    onSuccess: () => {
      toast.success('Project stopped');
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => { toast.error(error.message || 'Stop failed'); },
  });

  const restartMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/restart`),
    onSuccess: () => {
      toast.success('Project restarted');
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => { toast.error(error.message || 'Restart failed'); },
  });

  const logsQuery = useQuery<{ logs: LogEntry[] }>({
    queryKey: ['projects', id, 'logs'],
    queryFn: () => api.get(`/projects/${id}/logs?tail=100`),
    enabled: showLogsModal && !!id,
    refetchInterval: false,
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
    defaultValues: emptyProjectFormValues,
  });

  useEffect(() => {
    if (!isEditing) {
      reset(emptyProjectFormValues);
      setSubdomainPrefix('');
      setBaseDomain('');
      return;
    }
    if (project) {
      const expConfig =
        typeof project.exposureConfig === 'string'
          ? JSON.parse(project.exposureConfig || '{}')
          : project.exposureConfig || {};
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
  }, [isEditing, project, reset]);

  useEffect(() => {
    if (isEditing) return;
    const defaultId = settingsData?.defaultExposureProviderId;
    if (defaultId) setValue('exposureProviderId', defaultId);
  }, [isEditing, settingsData, setValue]);

  const composeContent = watch('composeContent');
  const exposureEnabled = watch('exposureEnabled');
  const selectedProviderId = watch('exposureProviderId');
  const exposureConfig = watch('exposureConfig') as Record<string, unknown> | undefined;

  const selectedProvider = availableProviders.find((p) => p.id === selectedProviderId);
  const isCloudflareProvider = selectedProvider?.providerType === 'cloudflare';

  const composeTargetPorts = useMemo(
    () => extractComposeTargetPorts(composeContent ?? ''),
    [composeContent],
  );

  const targetPort = parsePort(exposureConfig?.port) ?? 80;
  const targetPortMissingFromCompose =
    composeTargetPorts.length > 0 && !composeTargetPorts.includes(targetPort);

  const { data: availableDomains = [] } = useQuery<string[]>({
    queryKey: ['provider-domains', selectedProviderId],
    queryFn: () => api.get(`/settings/exposure-providers/${selectedProviderId}/domains`),
    enabled: !!selectedProviderId && exposureEnabled,
  });

  const validateDomain = () => {
    if (!isCloudflareProvider) return true;
    const errs: { subdomain?: string; domain?: string } = {};
    if (!subdomainPrefix.trim()) errs.subdomain = 'Required for Cloudflare';
    if (!baseDomain.trim()) errs.domain = 'Required for Cloudflare';
    setDomainErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleComposeChange = useCallback(
    (value: string) => { setValue('composeContent', value, { shouldDirty: true }); },
    [setValue],
  );

  const handleInferDetails = useCallback(() => {
    if (!composeContent) return;
    const extractedName = extractComposeProjectName(composeContent);
    if (extractedName) {
      setValue('name', extractedName, { shouldDirty: true });
      setSubdomainPrefix(extractedName);
    }
    const firstPort = extractFirstComposeTargetPort(composeContent);
    if (firstPort !== null) {
      const current = exposureConfig || {};
      setValue('exposureConfig', { ...current, port: firstPort }, { shouldDirty: true });
      setValue('exposureEnabled', true, { shouldDirty: true });
    }
  }, [composeContent, exposureConfig, setValue]);

  useEffect(() => {
    if (!composeContent || composeContent.trim().length === 0) {
      setValidation(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.post<ValidationResult>('/projects/compose/validate', { content: composeContent });
        setValidation(result);
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [composeContent]);

  const onSubmit = async (data: CreateProjectInput) => {
    if (!validateDomain()) return;
    try {
      const fullDomain = subdomainPrefix && baseDomain ? `${subdomainPrefix}.${baseDomain}` : null;
      const submitData = { ...data, domainName: fullDomain };
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
    if (!validateDomain()) return;
    const data = watch();
    try {
      const fullDomain = subdomainPrefix && baseDomain ? `${subdomainPrefix}.${baseDomain}` : null;
      await updateMutation.mutateAsync({ ...data, domainName: fullDomain });
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

  const updatesAvailable = containerUpdates?.some((u) => u.updateAvailable) ?? false;
  const updatesCount = containerUpdates?.filter((u) => u.updateAvailable).length ?? 0;
  const hasUpdateData = containerUpdates && containerUpdates.length > 0;

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-[13px] text-[rgba(255,255,255,0.35)]">Loading project…</p>
      </div>
    );
  }

  if (isEditing && !isLoading && !project) {
    return (
      <div className="p-6">
        <p className="text-[rgba(255,255,255,0.6)]">Project not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-[13px] text-[#7db0ff] transition-colors hover:text-[#9cc3ff]"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const projectDisplayName = watch('name') || (isEditing ? 'Edit Project' : 'New Project');

  return (
    <div className="flex min-h-full flex-col">

      {isCreate && adoptable && adoptable.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[rgba(100,158,245,0.18)] bg-[rgba(100,158,245,0.04)] px-4 py-3">
          <p className="text-[13px] text-[rgba(255,255,255,0.65)]">
            {adoptable.length} existing stack{adoptable.length > 1 ? 's' : ''} can be adopted
          </p>
          <button
            type="button"
            onClick={() => setAdoptDialogOpen(true)}
            className="rounded-xl bg-[#649ef5] px-3 py-1 text-[12px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
          >
            Adopt
          </button>
        </div>
      )}
      <AdoptStacksDialog open={adoptDialogOpen} onClose={() => setAdoptDialogOpen(false)} />

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.08] bg-[rgba(9,14,25,0.92)] px-6 py-3 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {watch('logoUrl') && (
            <img
              src={watch('logoUrl') as string}
              alt="logo"
              className="h-7 w-7 shrink-0 rounded object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <h1 className="font-rubik truncate text-[15px] font-semibold text-[rgba(255,255,255,0.92)]">
            {projectDisplayName}
          </h1>

          {isEditing && project?.status && (
            <span
              className={`font-rubik inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] ${
                statusStyles[project.status] ?? statusStyles.stopped
              } ${project.status === 'starting' ? 'animate-pulse' : ''}`}
            >
              {project.status}
            </span>
          )}

          {isEditing && project?.status === 'running' && project?.domainName && (
            <a
              href={`https://${project.domainName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:text-[#7db0ff]"
            >
              <Globe className="h-3 w-3" />
              {project.domainName}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={() => setShowTemplatePicker(true)}
              className="rounded-xl border border-[rgba(100,158,245,0.4)] px-3 py-1.5 text-[13px] text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)]"
            >
              Use Template
            </button>
          )}

          <button
            type="submit"
            form="project-form"
            disabled={isSubmitting}
            className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl px-3 py-1.5 text-[13px] text-[rgba(255,255,255,0.4)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
          >
            Cancel
          </button>
        </div>
      </header>

      {/* ── Two-column form (true 50/50) ── */}
      <form
        id="project-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid flex-1 grid-cols-1 lg:grid-cols-2"
      >
        {/* ── LEFT: Config ── */}
        <div className="flex flex-col gap-6 border-b border-white/[0.08] p-6 lg:border-b-0 lg:border-r">

          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="name" className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
              Project Name
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              placeholder="my-awesome-service"
              data-1p-ignore
              autoComplete="off"
              className={inputCls}
            />
            {errors.name && (
              <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.name.message}</p>
            )}
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <label htmlFor="logoUrl" className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
              Logo URL{' '}
              <span className="font-normal text-[rgba(255,255,255,0.28)]">(optional)</span>
            </label>
            <input
              id="logoUrl"
              type="text"
              {...register('logoUrl')}
              placeholder="https://example.com/logo.png"
              className={inputCls}
            />
            {errors.logoUrl && (
              <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.logoUrl.message}</p>
            )}
          </div>

          {/* Exposure */}
          <div className="space-y-3 rounded-2xl border border-white/[0.08] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-rubik text-[13px] font-medium text-[rgba(255,255,255,0.85)]">
                  External Exposure
                </p>
                <p className="mt-0.5 text-[12px] text-[rgba(255,255,255,0.38)]">
                  Expose this service via a reverse proxy
                </p>
              </div>
              <Toggle
                checked={exposureEnabled}
                onChange={(v) => setValue('exposureEnabled', v, { shouldDirty: true })}
              />
            </div>

            <div
              className="grid transition-all duration-200"
              style={{ gridTemplateRows: exposureEnabled ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="space-y-4 pt-1">

                  {/* Provider select */}
                  <div className="space-y-1.5">
                    <label className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
                      Provider
                    </label>
                    <div className="relative">
                      <select
                        {...register('exposureProviderId')}
                        className={selectCls}
                      >
                        <option value="">Select a provider…</option>
                        {availableProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.providerType})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.35)]" />
                    </div>
                    {availableProviders.length === 0 && (
                      <p className="text-[12px] text-[rgba(255,255,255,0.35)]">
                        No providers configured.{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/settings')}
                          className="text-[#7db0ff] hover:underline"
                        >
                          Add one in Settings.
                        </button>
                      </p>
                    )}
                  </div>

                  {/* Domain */}
                  <div className="space-y-1.5">
                    <label className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
                      Domain{' '}
                      {isCloudflareProvider ? (
                        <span className="text-[rgba(254,202,202,0.85)]">*</span>
                      ) : (
                        <span className="font-normal text-[rgba(255,255,255,0.28)]">(optional)</span>
                      )}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={subdomainPrefix}
                        onChange={(e) => {
                          setSubdomainPrefix(e.target.value);
                          if (domainErrors.subdomain) setDomainErrors((prev) => ({ ...prev, subdomain: undefined }));
                        }}
                        placeholder="myapp"
                        className={`${inputCls} flex-1 ${domainErrors.subdomain ? 'border-[rgba(248,113,113,0.5)]' : ''}`}
                      />
                      <span className="shrink-0 text-[14px] text-[rgba(255,255,255,0.28)]">.</span>
                      {availableDomains.length > 0 ? (
                        <div className="relative flex-1">
                          <select
                            value={baseDomain}
                            onChange={(e) => {
                              setBaseDomain(e.target.value);
                              if (domainErrors.domain) setDomainErrors((prev) => ({ ...prev, domain: undefined }));
                            }}
                            className={`${selectCls} ${domainErrors.domain ? 'border-[rgba(248,113,113,0.5)]' : ''}`}
                          >
                            <option value="">Select domain…</option>
                            {availableDomains.map((domain: string) => (
                              <option key={domain} value={domain}>{domain}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.35)]" />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={baseDomain}
                          onChange={(e) => {
                            setBaseDomain(e.target.value);
                            if (domainErrors.domain) setDomainErrors((prev) => ({ ...prev, domain: undefined }));
                          }}
                          placeholder="example.com"
                          className={`${inputCls} flex-1 ${domainErrors.domain ? 'border-[rgba(248,113,113,0.5)]' : ''}`}
                        />
                      )}
                    </div>
                    {(domainErrors.subdomain || domainErrors.domain) && (
                      <p className="text-[12px] text-[rgba(254,202,202,0.85)]">
                        {domainErrors.subdomain && domainErrors.domain
                          ? 'Subdomain and domain are required'
                          : domainErrors.subdomain
                            ? 'Subdomain is required'
                            : 'Domain is required'}
                      </p>
                    )}
                    {!domainErrors.subdomain && !domainErrors.domain && (subdomainPrefix || baseDomain) && (
                      <p className="text-[12px] text-[rgba(255,255,255,0.35)]">
                        → {subdomainPrefix || '…'}.{baseDomain || '…'}
                      </p>
                    )}
                  </div>

                  {/* Target port */}
                  <div className="space-y-1.5">
                    <label htmlFor="exposurePort" className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
                      Target Port
                    </label>
                    <input
                      id="exposurePort"
                      type="number"
                      value={targetPort}
                      onChange={(e) => {
                        const current = watch('exposureConfig') || {};
                        setValue('exposureConfig', { ...current, port: parsePort(e.target.value) ?? 80 }, { shouldDirty: true });
                      }}
                      placeholder="80"
                      min={1}
                      max={65535}
                      className={`${inputCls} w-28 font-variant-numeric-tabular`}
                    />
                    {composeTargetPorts.length > 0 && (
                      <p className="text-[12px] text-[rgba(255,255,255,0.35)]">
                        Detected: {composeTargetPorts.join(', ')}
                      </p>
                    )}
                    {targetPortMissingFromCompose && (
                      <p className="text-[12px] text-[#fcd34d]">
                        Port {targetPort} not found in Compose ports list
                      </p>
                    )}
                  </div>

                  {/* Exposure status for running projects */}
                  {isEditing && project?.status === 'running' && exposureStatus && (
                    <div
                      className={`rounded-xl px-3 py-2.5 text-[13px] ${
                        exposureStatus.active
                          ? 'bg-[rgba(74,222,128,0.08)] text-[#76e5a2]'
                          : 'bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.45)]'
                      }`}
                    >
                      <span className="font-medium">
                        {exposureStatus.active ? 'Route active' : 'Route inactive'}
                      </span>
                      {exposureStatus.domain && (
                        <span className="ml-2 opacity-70">({exposureStatus.domain})</span>
                      )}
                      {exposureStatus.message && (
                        <p className="mt-0.5 text-[12px] opacity-70">{exposureStatus.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Ops bar + Editor ── */}
        <div className="flex flex-col gap-4 p-6">

          {/* Ops bar — edit mode only */}
          {isEditing && project && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[rgba(255,255,255,0.02)] px-4 py-2.5">

                {/* Left zone: deployment controls */}
                <div className="flex flex-1 items-center gap-2">
                  {(isStopped || project.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => deployMutation.mutate()}
                      disabled={isDeploying}
                      className="rounded-lg bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.25)] px-3 py-1 text-[12px] font-medium text-[#4ade80] transition-colors hover:bg-[rgba(74,222,128,0.18)] disabled:opacity-40"
                    >
                      {isDeploying ? 'Deploying…' : 'Deploy'}
                    </button>
                  )}

                  {isRunning && (
                    <>
                      {isDirty && (
                        <button
                          type="button"
                          onClick={handleSaveAndDeploy}
                          disabled={isDeploying || updateMutation.isPending}
                          className="rounded-lg bg-[#649ef5] px-3 py-1 text-[12px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
                        >
                          {updateMutation.isPending || isDeploying ? 'Redeploying…' : 'Save & Redeploy'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => restartMutation.mutate()}
                        disabled={restartMutation.isPending}
                        className="rounded-lg border border-[rgba(100,158,245,0.3)] px-3 py-1 text-[12px] text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)] disabled:opacity-40"
                      >
                        {restartMutation.isPending ? 'Restarting…' : 'Restart'}
                      </button>
                      <button
                        type="button"
                        onClick={() => stopMutation.mutate()}
                        disabled={stopMutation.isPending}
                        className="rounded-lg border border-[rgba(248,113,113,0.28)] px-3 py-1 text-[12px] text-[rgba(254,202,202,0.75)] transition-colors hover:bg-[rgba(127,29,29,0.15)] disabled:opacity-40"
                      >
                        {stopMutation.isPending ? 'Stopping…' : 'Stop'}
                      </button>
                    </>
                  )}

                  {isDeploying && !isStopped && !isRunning && (
                    <span className="text-[12px] text-[rgba(255,255,255,0.35)]">Deploying…</span>
                  )}
                </div>

                {/* Middle zone: container update status */}
                <div className="flex shrink-0 items-center gap-2">
                  {checkUpdatesMutation.isPending ? (
                    <span className="text-[12px] text-[rgba(255,255,255,0.35)]">Checking…</span>
                  ) : hasUpdateData ? (
                    <>
                      {updatesAvailable ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
                          <span className="text-[12px] text-[#facc15]">
                            {updatesCount} update{updatesCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                          <span className="text-[12px] text-[rgba(255,255,255,0.38)]">Up to date</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => checkUpdatesMutation.mutate()}
                        className="text-[12px] text-[rgba(255,255,255,0.25)] transition-colors hover:text-[rgba(255,255,255,0.5)]"
                      >
                        Check again
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => checkUpdatesMutation.mutate()}
                      className="text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
                    >
                      Check for updates
                    </button>
                  )}
                </div>

                {/* Right zone: logs */}
                <button
                  type="button"
                  onClick={() => setShowLogsModal(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-1 text-[12px] text-[rgba(255,255,255,0.45)] transition-colors hover:border-white/[0.22] hover:text-[rgba(255,255,255,0.7)]"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Logs
                </button>
              </div>

              {/* Deploy progress log */}
              <div
                className="grid transition-all duration-200"
                style={{ gridTemplateRows: deployProgress.length > 0 ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="max-h-28 overflow-y-auto rounded-xl bg-[rgba(4,7,15,0.6)] px-4 py-3">
                    {deployProgress.map((p, i) => (
                      <div key={i} className="flex gap-2 font-mono text-[12px] leading-relaxed">
                        <span className="shrink-0 text-[rgba(255,255,255,0.22)]">[{p.stage}]</span>
                        <span className="text-[rgba(255,255,255,0.58)]">{p.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Compose editor */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-rubik text-[12px] font-medium text-[rgba(255,255,255,0.6)]">
                docker-compose.yml
              </label>
              <button
                type="button"
                onClick={handleInferDetails}
                disabled={!composeContent}
                className="rounded-lg px-3 py-1 text-[12px] text-[rgba(255,255,255,0.4)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Infer details
              </button>
            </div>
            <ComposeEditor
              value={composeContent ?? ''}
              onChange={handleComposeChange}
              errors={validation?.errors}
              warnings={validation?.warnings}
              minHeight="480px"
            />
            {errors.composeContent && (
              <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.composeContent.message}</p>
            )}
          </div>
        </div>
      </form>

      {/* ── Danger zone — edit mode only ── */}
      {isEditing && project && (
        <div className="border-t border-white/[0.08] px-6 py-8">
          <h3 className="font-rubik text-[14px] font-semibold text-[rgba(248,113,113,0.75)]">
            Delete Project
          </h3>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-[rgba(255,255,255,0.38)]">
            Removes this project and stops all associated containers. This cannot be undone.
          </p>
          <div className="mt-4">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-[rgba(255,255,255,0.45)]">
                  Delete &ldquo;{project.name}&rdquo;?
                </span>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-[13px] text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="rounded-xl border border-[rgba(248,113,113,0.36)] bg-[rgba(127,29,29,0.20)] px-4 py-1.5 text-[13px] text-[rgba(254,202,202,0.92)] transition-colors hover:bg-[rgba(127,29,29,0.30)] disabled:opacity-40"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl border border-[rgba(248,113,113,0.28)] px-4 py-1.5 text-[13px] text-[rgba(248,113,113,0.65)] transition-colors hover:border-[rgba(248,113,113,0.45)] hover:bg-[rgba(127,29,29,0.12)] hover:text-[rgba(254,202,202,0.85)]"
              >
                Delete Project
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Logs modal ── */}
      {showLogsModal && (
        <LogsModal
          logs={logsQuery.data?.logs}
          isLoading={logsQuery.isLoading}
          isFetching={logsQuery.isFetching}
          onRefresh={() => logsQuery.refetch()}
          onClose={() => setShowLogsModal(false)}
          projectName={watch('name') || project?.name || ''}
        />
      )}

      {/* ── Template picker modal ── */}
      {showTemplatePicker && (
        <TemplatePickerModal
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  );
}
