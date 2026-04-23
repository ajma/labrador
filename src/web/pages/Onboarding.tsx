import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { registerSchema, type ExposureProviderInput } from '@shared/schemas';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRegister, useAuthStatus } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';
import { CloudflareProviderForm, type CloudflareProviderFormValue } from '../components/CloudflareProviderForm';
import { resolveCloudflareBeforeSave, deployCloudflaredProject } from '../lib/cloudflare';

type OnboardingStep = 1 | 2 | 3;

const createAccountSchema = registerSchema.extend({
  confirmPassword: z.string().min(8).max(128),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type CreateAccountInput = z.infer<typeof createAccountSchema>;

interface ProviderConfig {
  caddy?: { apiUrl: string };
  cloudflare?: CloudflareProviderFormValue;
}

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

const inputCls =
  'flex h-10 w-full rounded-[14px] border border-white/[0.20] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-md text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.28)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)] disabled:cursor-not-allowed disabled:opacity-50';

function SetupCheckDisplay({ result }: { result: ProviderSetupResult }) {
  return (
    <div className="mt-3 space-y-2">
      {result.checks.map((check) => (
        <div key={check.name} className="flex gap-3">
          <span className={`mt-px shrink-0 text-sm font-medium ${check.passed ? 'text-[#4ade80]' : 'text-[rgba(248,113,113,0.85)]'}`}>
            {check.passed ? '✓' : '✗'}
          </span>
          <div>
            <span className="text-sm text-[rgba(255,255,255,0.75)]">{check.name}</span>
            <span className="text-sm text-[rgba(255,255,255,0.35)]"> — {check.message}</span>
            {!check.passed && check.resolution && (
              <p className="mt-0.5 text-xs text-[rgba(255,255,255,0.38)]">Fix: {check.resolution}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const steps = [
    { step: 1, label: 'Account' },
    { step: 2, label: 'Providers' },
    { step: 3, label: 'Complete' },
  ] as const;

  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {steps.map(({ step, label }) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              step === currentStep
                ? 'bg-[#649ef5] text-[#101827]'
                : step < currentStep
                  ? 'bg-[rgba(100,158,245,0.15)] text-[#7db0ff]'
                  : 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.35)]'
            }`}
          >
            {step}
          </div>
          <span
            className={`text-sm ${
              step === currentStep
                ? 'font-medium text-[rgba(255,255,255,0.85)]'
                : 'text-[rgba(255,255,255,0.38)]'
            }`}
          >
            {label}
          </span>
          {step < 3 && <div className="mx-2 h-px w-8 bg-[rgba(255,255,255,0.08)]" />}
        </div>
      ))}
    </div>
  );
}

function CreateAccountStep({ onComplete }: { onComplete: () => void }) {
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
  });

  const onSubmit = ({ username, password }: CreateAccountInput) => {
    registerMutation.mutate({ username, password }, {
      onSuccess: () => {
        toast.success('Admin account created');
        onComplete();
      },
    });
  };

  return (
    <div className="rounded-2xl border border-white/[0.10] bg-[rgba(255,255,255,0.03)] p-6">
      <h2 className="mb-1 text-lg font-semibold text-[rgba(255,255,255,0.88)]">Create Admin Account</h2>
      <p className="mb-5 text-sm text-[rgba(255,255,255,0.38)]">
        Set up the administrator account for your HomelabMan instance.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">Username</label>
          <Input id="username" placeholder="Choose a username" {...register('username')} />
          {errors.username && <p className="text-xs text-[rgba(254,202,202,0.85)]">{errors.username.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">Password</label>
          <Input id="password" type="password" placeholder="Choose a strong password" {...register('password')} />
          {errors.password && <p className="text-xs text-[rgba(254,202,202,0.85)]">{errors.password.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">Confirm Password</label>
          <Input id="confirm-password" type="password" placeholder="Re-enter your password" {...register('confirmPassword')} />
          {errors.confirmPassword && <p className="text-xs text-[rgba(254,202,202,0.85)]">{errors.confirmPassword.message}</p>}
        </div>
        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="mt-2 w-full rounded-xl bg-[#649ef5] py-2 text-sm font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
        >
          {registerMutation.isPending ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

function ConfigureProvidersStep({
  providerConfig,
  onConfigChange,
  onNext,
  onSkip,
}: {
  providerConfig: ProviderConfig;
  onConfigChange: (config: ProviderConfig) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [expandedProvider, setExpandedProvider] = useState<'caddy' | 'cloudflare' | null>(null);
  const [setupResults, setSetupResults] = useState<Record<string, ProviderSetupResult>>({});
  const [checkingSetup, setCheckingSetup] = useState<Record<string, boolean>>({});

  const runCheckSetup = async (providerType: string, configuration: Record<string, any>) => {
    setCheckingSetup((prev) => ({ ...prev, [providerType]: true }));
    try {
      const result = await api.post<ProviderSetupResult>('/settings/exposure-providers/check-setup', {
        providerType,
        configuration,
      });
      setSetupResults((prev) => ({ ...prev, [providerType]: result }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to check setup');
    } finally {
      setCheckingSetup((prev) => ({ ...prev, [providerType]: false }));
    }
  };

  const [caddyApiUrl, setCaddyApiUrl] = useState(providerConfig.caddy?.apiUrl ?? 'http://localhost:2019');
  const [cfFormValue, setCfFormValue] = useState<CloudflareProviderFormValue>({
    apiToken: providerConfig.cloudflare?.apiToken ?? '',
    accountId: providerConfig.cloudflare?.accountId ?? '',
    tunnelId: providerConfig.cloudflare?.tunnelId ?? '__new__',
    tunnelName: providerConfig.cloudflare?.tunnelName ?? '',
    deployContainer: providerConfig.cloudflare?.deployContainer ?? true,
    adoptStackName: providerConfig.cloudflare?.adoptStackName ?? null,
  });

  const [detectedStack, setDetectedStack] = useState<{ stackName: string; providerType: string } | null>(null);

  useEffect(() => {
    api.get<{ detected: boolean; stackName?: string; providerType?: string }>('/projects/detect-provider-stack')
      .then((res) => {
        if (res.detected && res.stackName && res.providerType) {
          setDetectedStack({ stackName: res.stackName, providerType: res.providerType });
        }
      })
      .catch(() => {});
  }, []);

  const saveCaddy = () => {
    onConfigChange({ ...providerConfig, caddy: { apiUrl: caddyApiUrl } });
    setExpandedProvider(null);
    toast.success('Caddy configuration saved');
  };

  const removeCaddy = () => {
    const { caddy: _caddy, ...rest } = providerConfig;
    onConfigChange(rest);
    toast.info('Caddy configuration removed');
  };

  const saveCloudflare = () => {
    if (!cfFormValue.apiToken || !cfFormValue.accountId) {
      toast.error('Connect your token and select an account before saving');
      return;
    }
    if (cfFormValue.tunnelId === '__new__' && !cfFormValue.tunnelName.trim()) {
      toast.error('Enter a tunnel name');
      return;
    }
    onConfigChange({ ...providerConfig, cloudflare: cfFormValue });
    setExpandedProvider(null);
    toast.success('Cloudflare configuration saved');
  };

  const removeCloudflare = () => {
    const { cloudflare: _cloudflare, ...rest } = providerConfig;
    onConfigChange(rest);
    toast.info('Cloudflare configuration removed');
  };

  return (
    <div className="rounded-2xl border border-white/[0.10] bg-[rgba(255,255,255,0.03)] p-6">
      <h2 className="mb-1 text-lg font-semibold text-[rgba(255,255,255,0.88)]">Configure Exposure Providers</h2>
      <p className="mb-5 text-sm text-[rgba(255,255,255,0.38)]">
        Optionally configure how your services are exposed to the internet. You can skip this and configure later in Settings.
      </p>

      <div className="space-y-3">
        {/* Caddy Provider */}
        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[rgba(255,255,255,0.85)]">Caddy</p>
              <p className="text-xs text-[rgba(255,255,255,0.35)]">Reverse proxy with automatic HTTPS</p>
              {providerConfig.caddy && expandedProvider !== 'caddy' && (
                <p className="mt-0.5 text-xs text-[rgba(255,255,255,0.38)]">
                  Configured: {providerConfig.caddy.apiUrl}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {providerConfig.caddy && (
                <button
                  onClick={removeCaddy}
                  className="rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
                >
                  Remove
                </button>
              )}
              {providerConfig.caddy && expandedProvider !== 'caddy' && (
                <button
                  onClick={() => runCheckSetup('caddy', { apiUrl: providerConfig.caddy!.apiUrl })}
                  disabled={checkingSetup['caddy']}
                  className="rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)] disabled:opacity-40"
                >
                  {checkingSetup['caddy'] ? 'Checking…' : 'Check Setup'}
                </button>
              )}
              <button
                onClick={() => setExpandedProvider(expandedProvider === 'caddy' ? null : 'caddy')}
                className="rounded-lg border border-[rgba(100,158,245,0.4)] px-3 py-1 text-xs text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)]"
              >
                {providerConfig.caddy ? 'Edit' : 'Configure'}
              </button>
            </div>
          </div>
          {setupResults['caddy'] && expandedProvider !== 'caddy' && (
            <div className="border-t border-white/[0.06] px-4 pb-3">
              <SetupCheckDisplay result={setupResults['caddy']} />
            </div>
          )}
          {expandedProvider === 'caddy' && (
            <div className="border-t border-white/[0.06] px-4 py-4 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="caddy-api-url" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">API URL</label>
                <input
                  id="caddy-api-url"
                  type="text"
                  placeholder="http://localhost:2019"
                  value={caddyApiUrl}
                  onChange={(e) => setCaddyApiUrl(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                onClick={saveCaddy}
                className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-sm font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Cloudflare Provider */}
        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[rgba(255,255,255,0.85)]">Cloudflare</p>
              <p className="text-xs text-[rgba(255,255,255,0.35)]">Tunnel-based exposure via Cloudflare</p>
              {providerConfig.cloudflare && expandedProvider !== 'cloudflare' && (
                <p className="mt-0.5 text-xs text-[rgba(255,255,255,0.38)]">
                  Account {providerConfig.cloudflare.accountId}
                  {providerConfig.cloudflare.tunnelId !== '__new__'
                    ? ` · Tunnel ${providerConfig.cloudflare.tunnelId}`
                    : ` · New tunnel "${providerConfig.cloudflare.tunnelName}"`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {providerConfig.cloudflare && (
                <button
                  onClick={removeCloudflare}
                  className="rounded-lg px-2.5 py-1 text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setExpandedProvider(expandedProvider === 'cloudflare' ? null : 'cloudflare')}
                className="rounded-lg border border-[rgba(100,158,245,0.4)] px-3 py-1 text-xs text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)]"
              >
                {providerConfig.cloudflare ? 'Edit' : 'Configure'}
              </button>
            </div>
          </div>
          {expandedProvider === 'cloudflare' && (
            <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
              <CloudflareProviderForm value={cfFormValue} onChange={setCfFormValue} detectedStack={detectedStack} />
              <button
                onClick={saveCloudflare}
                className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-sm font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={onSkip}
          className="rounded-xl px-4 py-1.5 text-sm text-[rgba(255,255,255,0.38)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[rgba(255,255,255,0.65)]"
        >
          Skip
        </button>
        <button
          onClick={onNext}
          className="rounded-xl bg-[#649ef5] px-4 py-1.5 text-sm font-medium text-[#101827] transition-colors hover:bg-[#7db0ff]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function CompleteStep({
  providerConfig,
  onFinish,
  isSubmitting,
}: {
  providerConfig: ProviderConfig;
  onFinish: () => void;
  isSubmitting: boolean;
}) {
  const configuredProviders: string[] = [];
  if (providerConfig.caddy) configuredProviders.push('Caddy');
  if (providerConfig.cloudflare) configuredProviders.push('Cloudflare');

  return (
    <div className="rounded-2xl border border-white/[0.10] bg-[rgba(255,255,255,0.03)] p-6">
      <h2 className="mb-1 text-lg font-semibold text-[rgba(255,255,255,0.88)]">Setup Complete</h2>
      <p className="mb-5 text-sm text-[rgba(255,255,255,0.38)]">Your HomelabMan instance is ready to use.</p>
      <div className="mb-5 rounded-xl border border-white/[0.08] bg-[rgba(255,255,255,0.02)] px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[rgba(255,255,255,0.35)]">Configuration Summary</p>
        <ul className="space-y-1 text-sm text-[rgba(255,255,255,0.55)]">
          <li>Admin account created</li>
          {configuredProviders.length > 0 ? (
            <li>Exposure providers configured: {configuredProviders.join(', ')}</li>
          ) : (
            <li>No exposure providers configured (can be added in Settings)</li>
          )}
        </ul>
      </div>
      <button
        onClick={onFinish}
        disabled={isSubmitting}
        className="w-full rounded-xl bg-[#649ef5] py-2 text-sm font-medium text-[#101827] transition-colors hover:bg-[#7db0ff] disabled:opacity-40"
      >
        {isSubmitting ? 'Finishing Setup…' : 'Get Started'}
      </button>
    </div>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: authStatus } = useAuthStatus();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authStatus?.authenticated) setStep((s) => s === 1 ? 2 : s);
  }, [authStatus?.authenticated]);

  if (authStatus && !authStatus.needsOnboarding) {
    return <Navigate to="/" replace />;
  }

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const exposureProviders: ExposureProviderInput[] = [];

      if (providerConfig.caddy) {
        exposureProviders.push({
          providerType: 'caddy',
          name: 'Caddy',
          enabled: true,
          configuration: { apiUrl: providerConfig.caddy.apiUrl },
        });
      }

      if (providerConfig.cloudflare) {
        const cf = providerConfig.cloudflare;

        // When adopting, skip tunnel creation/token fetch — the container is already running.
        const { tunnelId, tunnelToken } = cf.adoptStackName
          ? { tunnelId: cf.tunnelId, tunnelToken: null }
          : await resolveCloudflareBeforeSave(cf);

        if (cf.adoptStackName) {
          const adoptResult = await api.post<{ adopted: string[]; failed: { stackName: string; reason: string }[] }>(
            '/projects/adopt',
            { stackNames: [cf.adoptStackName], isInfrastructure: true },
          );
          if (adoptResult.failed.length > 0) {
            throw new Error(`Failed to adopt cloudflared stack: ${adoptResult.failed[0].reason}`);
          }
        } else if (cf.deployContainer && tunnelToken) {
          await deployCloudflaredProject(tunnelToken);
        }

        exposureProviders.push({
          providerType: 'cloudflare',
          name: 'Cloudflare',
          enabled: true,
          configuration: {
            apiToken: cf.apiToken,
            accountId: cf.accountId,
            tunnelId,
          },
        });
      }

      await api.post('/settings/onboarding', { exposureProviders });
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      toast.success('Setup complete! Welcome to HomelabMan.');
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-1 text-center text-2xl font-semibold text-[rgba(255,255,255,0.92)]">
          Welcome to HomelabMan
        </h1>
        <p className="mb-6 text-center text-sm text-[rgba(255,255,255,0.38)]">
          Let&apos;s get your instance set up.
        </p>
        <StepIndicator currentStep={step} />
        {step === 1 && <CreateAccountStep onComplete={() => setStep(2)} />}
        {step === 2 && (
          <ConfigureProvidersStep
            providerConfig={providerConfig}
            onConfigChange={setProviderConfig}
            onNext={() => setStep(3)}
            onSkip={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <CompleteStep
            providerConfig={providerConfig}
            onFinish={handleFinish}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}
