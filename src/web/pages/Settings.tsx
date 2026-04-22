import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, CheckCircle2 } from 'lucide-react';
import {
  exposureProviderSchema,
  changePasswordSchema,
  type ExposureProviderInput,
  type ChangePasswordInput,
} from '@shared/schemas';
import type { ExposureProviderConfig, Settings as SettingsType } from '@shared/types';
import { api } from '../lib/api';
import { resolveCloudflareBeforeSave, deployCloudflaredProject } from '../lib/cloudflare';
import { CloudflareProviderForm, type CloudflareProviderFormValue } from '../components/CloudflareProviderForm';

// ─── shared input class ──────────────────────────────────────────────────────

const inputCls =
  'flex h-10 w-full rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[14px] text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.28)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)] disabled:cursor-not-allowed disabled:opacity-50';

// ─── anchor sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'providers', label: 'Providers' },
  { id: 'data', label: 'Data' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function AnchorNav({ active }: { active: SectionId }) {
  const scrollTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    window.location.hash = id;
  };

  return (
    <nav className="flex items-center gap-6 pb-4 mb-8 border-b border-white/[0.06] sticky top-0 bg-[#04070f] z-10 pt-1">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className={`relative text-[13px] font-medium pb-1 transition-colors ${
            active === s.id
              ? 'text-[rgba(255,255,255,0.92)]'
              : 'text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.65)]'
          }`}
        >
          {s.label}
          {active === s.id && (
            <span className="absolute bottom-0 left-0 right-0 h-px bg-[rgba(100,158,245,0.7)]" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  id,
  heading,
  description,
  children,
  first,
}: {
  id: SectionId;
  heading: string;
  description: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <>
      {!first && <div className="h-px bg-white/[0.06] my-16" />}
      <section id={id} className="scroll-mt-12">
        <div className="mb-6">
          <h2 className="text-[15px] font-semibold text-[rgba(255,255,255,0.88)]">{heading}</h2>
          <p className="mt-0.5 text-[13px] text-[rgba(255,255,255,0.38)]">{description}</p>
        </div>
        {children}
      </section>
    </>
  );
}

// ─── setup check display ─────────────────────────────────────────────────────

interface SetupCheck {
  name: string;
  passed: boolean;
  message: string;
  resolution?: string;
}

interface ProviderSetupResult {
  allPassed: boolean;
  checks: SetupCheck[];
}

function SetupCheckDisplay({ result }: { result: ProviderSetupResult }) {
  return (
    <div className="mt-3 space-y-2">
      {result.checks.map((check) => (
        <div key={check.name} className="flex gap-3">
          <span className={`mt-px shrink-0 text-[13px] font-medium ${check.passed ? 'text-[#4ade80]' : 'text-[rgba(248,113,113,0.85)]'}`}>
            {check.passed ? '✓' : '✗'}
          </span>
          <div>
            <span className="text-[13px] text-[rgba(255,255,255,0.75)]">{check.name}</span>
            <span className="text-[13px] text-[rgba(255,255,255,0.35)]"> — {check.message}</span>
            {!check.passed && check.resolution && (
              <p className="mt-0.5 text-[12px] text-[rgba(255,255,255,0.38)]">Fix: {check.resolution}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── provider type toggle ─────────────────────────────────────────────────────

function ProviderTypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'caddy' | 'cloudflare';
  onChange: (t: 'caddy' | 'cloudflare') => void;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-xl border border-white/[0.15] p-0.5 ${disabled ? 'opacity-50' : ''}`}>
      {(['caddy', 'cloudflare'] as const).map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(type)}
          className={`rounded-[10px] px-4 py-1.5 text-[13px] font-medium capitalize transition-colors ${
            value === type
              ? 'bg-[rgba(100,158,245,0.15)] text-[#7db0ff]'
              : 'text-[rgba(255,255,255,0.38)] hover:text-[rgba(255,255,255,0.65)]'
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

// ─── provider form ────────────────────────────────────────────────────────────

function ProviderForm({
  provider,
  formRef,
  onSubmit,
  onDirty,
}: {
  provider?: ExposureProviderConfig;
  formRef: React.RefObject<HTMLFormElement | null>;
  onSubmit: (data: ExposureProviderInput) => void;
  onDirty: () => void;
}) {
  const [providerType, setProviderType] = useState<'caddy' | 'cloudflare'>(
    (provider?.providerType as 'caddy' | 'cloudflare') ?? 'caddy',
  );
  const [isPresaving, setIsPresaving] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ExposureProviderInput>({
    resolver: zodResolver(exposureProviderSchema),
    defaultValues: {
      providerType: (provider?.providerType as 'caddy' | 'cloudflare') ?? 'caddy',
      name: provider?.name ?? '',
      enabled: provider?.enabled ?? true,
      configuration: provider?.configuration ?? {},
    },
  });

  const currentConfig = watch('configuration');

  const [cfFormValue, setCfFormValue] = useState<CloudflareProviderFormValue>({
    apiToken: (provider?.configuration as any)?.apiToken ?? '',
    accountId: (provider?.configuration as any)?.accountId ?? '',
    tunnelId: (provider?.configuration as any)?.tunnelId ?? '__new__',
    tunnelName: '',
    deployContainer: true,
  });

  const handleTypeChange = (type: 'caddy' | 'cloudflare') => {
    setProviderType(type);
    setValue('providerType', type);
    setValue('configuration', type === 'caddy' ? { apiUrl: 'http://localhost:2019' } : {});
  };

  const handleFormSubmit = handleSubmit(async (data) => {
    if (providerType === 'cloudflare') {
      if (!cfFormValue.apiToken || !cfFormValue.accountId) {
        toast.error('Connect your token and select an account before saving');
        return;
      }
      if (cfFormValue.tunnelId === '__new__' && !cfFormValue.tunnelName.trim()) {
        toast.error('Enter a tunnel name');
        return;
      }
      setIsPresaving(true);
      try {
        const { tunnelId, tunnelToken } = await resolveCloudflareBeforeSave(cfFormValue);
        if (cfFormValue.deployContainer && tunnelToken) await deployCloudflaredProject(tunnelToken);
        onSubmit({ ...data, configuration: { apiToken: cfFormValue.apiToken, accountId: cfFormValue.accountId, tunnelId } });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create tunnel');
      } finally {
        setIsPresaving(false);
      }
      return;
    }
    onSubmit(data);
  });

  return (
    <form ref={formRef} onSubmit={handleFormSubmit} onChange={onDirty} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Type</label>
        <div>
          <ProviderTypeToggle value={providerType} onChange={handleTypeChange} disabled={!!provider} />
        </div>
        {!!provider && (
          <p className="text-[12px] text-[rgba(255,255,255,0.28)]">Provider type cannot be changed after creation.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Name</label>
        <input type="text" placeholder="e.g. My Caddy Server" className={inputCls} {...register('name')} />
        {errors.name && <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.name.message}</p>}
      </div>

      {providerType === 'caddy' && (
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">API URL</label>
          <input
            type="text"
            placeholder="http://localhost:2019"
            className={inputCls}
            value={(currentConfig as Record<string, string>).apiUrl ?? ''}
            onChange={(e) => setValue('configuration', { apiUrl: e.target.value })}
          />
        </div>
      )}

      {providerType === 'cloudflare' && (
        <CloudflareProviderForm value={cfFormValue} onChange={setCfFormValue} />
      )}

      {/* Hidden submit used by modal footer Save button via formRef.current.requestSubmit() */}
      <button type="submit" className="hidden" disabled={isPresaving} aria-hidden="true" />
    </form>
  );
}

// ─── provider modal ───────────────────────────────────────────────────────────

function ProviderModal({
  provider,
  onClose,
  onSave,
  isPending,
}: {
  provider?: ExposureProviderConfig;
  onClose: () => void;
  onSave: (data: ExposureProviderInput) => void;
  isPending: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== dialogRef.current) return;
    if (isDirtyRef.current && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  const handleCancel = () => {
    if (isDirtyRef.current && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        handleCancel();
      }}
      className="m-auto w-full max-w-lg rounded-2xl border border-white/[0.10] bg-[#0a1020] p-0 shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 shrink-0">
          <h3 className="text-[15px] font-semibold text-[rgba(255,255,255,0.88)]">
            {provider ? 'Edit Provider' : 'Add Provider'}
          </h3>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.65)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <ProviderForm
            provider={provider}
            formRef={formRef}
            onSubmit={(data) => { isDirtyRef.current = false; onSave(data); }}
            onDirty={() => { isDirtyRef.current = true; }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl px-4 py-1.5 text-[13px] text-[rgba(255,255,255,0.4)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => formRef.current?.requestSubmit()}
            className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ─── providers section ───────────────────────────────────────────────────────

function ProvidersSection() {
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: 'add' } | { mode: 'edit'; provider: ExposureProviderConfig } | null
  >(null);
  const [setupResults, setSetupResults] = useState<Record<string, ProviderSetupResult>>({});
  const [checkingSetup, setCheckingSetup] = useState<Record<string, boolean>>({});
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null);

  const settingsQuery = useQuery<SettingsType>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const providersQuery = useQuery<ExposureProviderConfig[]>({
    queryKey: ['settings', 'providers'],
    queryFn: () => api.get('/settings/exposure-providers'),
  });

  const createProvider = useMutation({
    mutationFn: (data: ExposureProviderInput) => api.post('/settings/exposure-providers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setModalState(null);
      toast.success('Provider added');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to add provider'),
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExposureProviderInput }) =>
      api.put(`/settings/exposure-providers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setModalState(null);
      toast.success('Provider updated');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update provider'),
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/exposure-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setDeletingProviderId(null);
      toast.success('Provider deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete provider');
      setDeletingProviderId(null);
    },
  });

  const setDefaultProvider = useMutation({
    mutationFn: (providerId: string | null) =>
      api.put('/settings', { defaultExposureProviderId: providerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Default provider updated');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update default provider'),
  });

  const runCheckSetup = async (provider: ExposureProviderConfig) => {
    setCheckingSetup((prev) => ({ ...prev, [provider.id]: true }));
    try {
      const result = await api.post<ProviderSetupResult>('/settings/exposure-providers/check-setup', {
        providerType: provider.providerType,
        configuration: provider.configuration,
      });
      setSetupResults((prev) => ({ ...prev, [provider.id]: result }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to check setup');
    } finally {
      setCheckingSetup((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const providers = providersQuery.data ?? [];
  const settings = settingsQuery.data;
  const modalIsPending =
    (modalState?.mode === 'add' && createProvider.isPending) ||
    (modalState?.mode === 'edit' && updateProvider.isPending);

  return (
    <>
      <div className="flex items-center justify-end gap-4 mb-4">
        <button
          onClick={() => setModalState({ mode: 'add' })}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[rgba(100,158,245,0.4)] px-3 py-1.5 text-[13px] text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Provider
        </button>
      </div>

      {providersQuery.isLoading ? (
        <p className="text-[13px] text-[rgba(255,255,255,0.35)]">Loading providers…</p>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.10] px-6 py-10 text-center">
          <p className="text-[13px] text-[rgba(255,255,255,0.35)]">
            No providers yet.{' '}
            <button onClick={() => setModalState({ mode: 'add' })} className="text-[#7db0ff] hover:underline">
              Add one
            </button>{' '}
            to expose your services.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.10] overflow-hidden">
          {providers.map((provider, i) => (
            <div key={provider.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium text-[rgba(255,255,255,0.85)]">{provider.name}</span>
                    {settings?.defaultExposureProviderId === provider.id && (
                      <span className="rounded-full bg-[rgba(100,158,245,0.12)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#7db0ff]">Default</span>
                    )}
                    {!provider.enabled && (
                      <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]">Disabled</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-[rgba(255,255,255,0.35)]">
                    {provider.providerType === 'caddy' ? 'Caddy Reverse Proxy' : 'Cloudflare Tunnel'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {settings?.defaultExposureProviderId !== provider.id && (
                    <button
                      onClick={() => setDefaultProvider.mutate(provider.id)}
                      className="rounded-lg px-2.5 py-1 text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => runCheckSetup(provider)}
                    disabled={checkingSetup[provider.id]}
                    className="rounded-lg px-2.5 py-1 text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)] disabled:opacity-40"
                  >
                    {checkingSetup[provider.id] ? 'Checking…' : 'Check setup'}
                  </button>
                  <button
                    onClick={() => setModalState({ mode: 'edit', provider })}
                    className="rounded-lg px-2.5 py-1 text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
                  >
                    Edit
                  </button>
                  {deletingProviderId === provider.id ? (
                    <div className="flex items-center gap-1.5 pl-1">
                      <span className="text-[12px] text-[rgba(255,255,255,0.45)]">Delete?</span>
                      <button
                        onClick={() => setDeletingProviderId(null)}
                        className="text-[12px] text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.6)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteProvider.mutate(provider.id)}
                        disabled={deleteProvider.isPending}
                        className="rounded-lg border border-[rgba(248,113,113,0.36)] px-2.5 py-0.5 text-[12px] text-[rgba(254,202,202,0.85)] transition-colors hover:bg-[rgba(127,29,29,0.20)] disabled:opacity-40"
                      >
                        {deleteProvider.isPending ? 'Deleting…' : 'Confirm'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingProviderId(provider.id)}
                      className="rounded-lg px-2.5 py-1 text-[12px] text-[rgba(255,255,255,0.25)] transition-colors hover:text-[rgba(248,113,113,0.75)]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {setupResults[provider.id] && <SetupCheckDisplay result={setupResults[provider.id]} />}
            </div>
          ))}
        </div>
      )}

      {providers.length > 0 && settings?.defaultExposureProviderId && (
        <button
          onClick={() => setDefaultProvider.mutate(null)}
          className="mt-3 text-[12px] text-[rgba(255,255,255,0.25)] transition-colors hover:text-[rgba(255,255,255,0.5)]"
        >
          Clear default provider
        </button>
      )}

      {/* Modal */}
      {modalState && (
        <ProviderModal
          provider={modalState.mode === 'edit' ? modalState.provider : undefined}
          onClose={() => setModalState(null)}
          onSave={(data) => {
            if (modalState.mode === 'add') createProvider.mutate(data);
            else updateProvider.mutate({ id: modalState.provider.id, data });
          }}
          isPending={modalIsPending}
        />
      )}
    </>
  );
}

// ─── account section ─────────────────────────────────────────────────────────

function AccountSection() {
  const [successVisible, setSuccessVisible] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const changePassword = useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.put('/auth/password', { currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      reset();
      setSuccessVisible(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccessVisible(false), 3000);
    },
    onError: (err: any) => {
      if (err?.status === 401) {
        setError('currentPassword', { message: 'That password is incorrect.' });
      } else {
        toast.error(err?.message ?? 'Failed to update password');
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => changePassword.mutate(data))} className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Current password</label>
        <input type="password" autoComplete="current-password" className={inputCls} {...register('currentPassword')} />
        {errors.currentPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.currentPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">New password</label>
        <input type="password" autoComplete="new-password" className={inputCls} {...register('newPassword')} />
        {errors.newPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">Confirm new password</label>
        <input type="password" autoComplete="new-password" className={inputCls} {...register('confirmPassword')} />
        {errors.confirmPassword && (
          <p className="text-[12px] text-[rgba(254,202,202,0.85)]">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        {successVisible && (
          <span className="flex items-center gap-1.5 text-[13px] text-[#4ade80]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Password updated.
          </span>
        )}
        <button
          type="submit"
          disabled={isSubmitting || changePassword.isPending}
          className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-[13px] font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
        >
          {isSubmitting || changePassword.isPending ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function Settings() {
  const [activeSection, setActiveSection] = useState<SectionId>('account');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="min-h-full p-6 max-w-2xl">
      <h1 className="text-[18px] font-semibold text-[rgba(255,255,255,0.92)] mb-6">Settings</h1>
      <AnchorNav active={activeSection} />

      <Section id="account" heading="Account" description="Change your login credentials." first>
        <AccountSection />
      </Section>

      <Section id="providers" heading="Exposure Providers" description="Configure how your services are exposed to the internet.">
        <ProvidersSection />
      </Section>

      <Section id="data" heading="Data" description="Back up or restore your HomelabMan configuration — projects, providers, and settings.">
        <p className="text-[13px] text-[rgba(255,255,255,0.38)]">Data section — coming soon.</p>
      </Section>
    </div>
  );
}
