import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
        <div
          key={check.name}
          className={`rounded-md p-2 text-sm ${
            check.passed
              ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{check.passed ? '✓' : '✗'}</span>
            <span className="font-medium">{check.name}</span>
            <span className="text-xs opacity-80">— {check.message}</span>
          </div>
          {!check.passed && check.resolution && (
            <p className="mt-1 pl-5 text-xs opacity-90">
              <span className="font-medium">Fix:</span> {check.resolution}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { registerSchema, type RegisterInput, type ExposureProviderInput } from '@shared/schemas';
import { useRegister } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

type OnboardingStep = 1 | 2 | 3;

interface ProviderConfig {
  caddy?: { apiUrl: string };
  cloudflare?: { apiToken: string; accountId: string; tunnelId: string };
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const steps = [
    { step: 1, label: 'Account' },
    { step: 2, label: 'Providers' },
    { step: 3, label: 'Complete' },
  ] as const;

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map(({ step, label }) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step === currentStep
                ? 'bg-primary text-primary-foreground'
                : step < currentStep
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {step}
          </div>
          <span
            className={`text-sm ${
              step === currentStep ? 'font-medium' : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
          {step < 3 && <div className="mx-2 h-px w-8 bg-border" />}
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
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = (data: RegisterInput) => {
    registerMutation.mutate(data, {
      onSuccess: () => {
        toast.success('Admin account created');
        onComplete();
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Admin Account</CardTitle>
        <CardDescription>
          Set up the administrator account for your HomelabMan instance.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Choose a username"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Choose a strong password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? 'Creating Account...' : 'Create Account'}
          </Button>
        </CardFooter>
      </form>
    </Card>
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

  const [caddyApiUrl, setCaddyApiUrl] = useState(
    providerConfig.caddy?.apiUrl ?? 'http://localhost:2019',
  );
  const [cfApiToken, setCfApiToken] = useState(providerConfig.cloudflare?.apiToken ?? '');
  const [cfAccountId, setCfAccountId] = useState(providerConfig.cloudflare?.accountId ?? '');
  const [cfTunnelId, setCfTunnelId] = useState(providerConfig.cloudflare?.tunnelId ?? '');

  const saveCaddy = () => {
    onConfigChange({ ...providerConfig, caddy: { apiUrl: caddyApiUrl } });
    setExpandedProvider(null);
    toast.success('Caddy configuration saved');
  };

  const removeCaddy = () => {
    const { caddy: _, ...rest } = providerConfig;
    onConfigChange(rest);
    toast.info('Caddy configuration removed');
  };

  const saveCloudflare = () => {
    if (!cfApiToken || !cfAccountId || !cfTunnelId) {
      toast.error('All Cloudflare fields are required');
      return;
    }
    onConfigChange({
      ...providerConfig,
      cloudflare: { apiToken: cfApiToken, accountId: cfAccountId, tunnelId: cfTunnelId },
    });
    setExpandedProvider(null);
    toast.success('Cloudflare configuration saved');
  };

  const removeCloudflare = () => {
    const { cloudflare: _, ...rest } = providerConfig;
    onConfigChange(rest);
    toast.info('Cloudflare configuration removed');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure Exposure Providers</CardTitle>
        <CardDescription>
          Optionally configure how your services are exposed to the internet. You can skip this and configure later in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Caddy Provider */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Caddy</CardTitle>
                <CardDescription>Reverse proxy with automatic HTTPS</CardDescription>
              </div>
              <div className="flex gap-2">
                {providerConfig.caddy && (
                  <Button variant="ghost" size="sm" onClick={removeCaddy}>
                    Remove
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpandedProvider(expandedProvider === 'caddy' ? null : 'caddy')
                  }
                >
                  {providerConfig.caddy ? 'Edit' : 'Configure'}
                </Button>
              </div>
            </div>
            {providerConfig.caddy && expandedProvider !== 'caddy' && (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  Configured: {providerConfig.caddy.apiUrl}
                </p>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runCheckSetup('caddy', { apiUrl: providerConfig.caddy!.apiUrl })}
                    disabled={checkingSetup['caddy']}
                  >
                    {checkingSetup['caddy'] ? 'Checking...' : 'Check Setup'}
                  </Button>
                </div>
                {setupResults['caddy'] && <SetupCheckDisplay result={setupResults['caddy']} />}
              </>
            )}
          </CardHeader>
          {expandedProvider === 'caddy' && (
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label htmlFor="caddy-api-url">API URL</Label>
                <Input
                  id="caddy-api-url"
                  placeholder="http://localhost:2019"
                  value={caddyApiUrl}
                  onChange={(e) => setCaddyApiUrl(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={saveCaddy}>
                Save
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Cloudflare Provider */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Cloudflare</CardTitle>
                <CardDescription>Tunnel-based exposure via Cloudflare</CardDescription>
              </div>
              <div className="flex gap-2">
                {providerConfig.cloudflare && (
                  <Button variant="ghost" size="sm" onClick={removeCloudflare}>
                    Remove
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpandedProvider(expandedProvider === 'cloudflare' ? null : 'cloudflare')
                  }
                >
                  {providerConfig.cloudflare ? 'Edit' : 'Configure'}
                </Button>
              </div>
            </div>
            {providerConfig.cloudflare && expandedProvider !== 'cloudflare' && (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  Configured: Account {providerConfig.cloudflare.accountId}
                </p>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      runCheckSetup('cloudflare', {
                        apiToken: providerConfig.cloudflare!.apiToken,
                        accountId: providerConfig.cloudflare!.accountId,
                        tunnelId: providerConfig.cloudflare!.tunnelId,
                      })
                    }
                    disabled={checkingSetup['cloudflare']}
                  >
                    {checkingSetup['cloudflare'] ? 'Checking...' : 'Check Setup'}
                  </Button>
                </div>
                {setupResults['cloudflare'] && <SetupCheckDisplay result={setupResults['cloudflare']} />}
              </>
            )}
          </CardHeader>
          {expandedProvider === 'cloudflare' && (
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label htmlFor="cf-api-token">API Token</Label>
                <Input
                  id="cf-api-token"
                  type="password"
                  placeholder="Enter your Cloudflare API token"
                  value={cfApiToken}
                  onChange={(e) => {
                    setCfApiToken(e.target.value);
                    setSetupResults((prev) => { const { cloudflare: _, ...rest } = prev; return rest; });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Create an API token
                  </a>{' '}
                  with <strong>Account → Cloudflare Tunnel → Edit</strong> and{' '}
                  <strong>Zone → Zone → Read</strong> permissions.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-account-id">Account ID</Label>
                <Input
                  id="cf-account-id"
                  placeholder="Enter your Account ID"
                  value={cfAccountId}
                  onChange={(e) => {
                    setCfAccountId(e.target.value);
                    setSetupResults((prev) => { const { cloudflare: _, ...rest } = prev; return rest; });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Found in your Cloudflare dashboard URL or under Account Home.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-tunnel-id">Tunnel ID</Label>
                <Input
                  id="cf-tunnel-id"
                  placeholder="Enter your Tunnel ID"
                  value={cfTunnelId}
                  onChange={(e) => {
                    setCfTunnelId(e.target.value);
                    setSetupResults((prev) => { const { cloudflare: _, ...rest } = prev; return rest; });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Found in Cloudflare Zero Trust → Networks → Tunnels. Select your tunnel to see the ID.
                </p>
              </div>
              {setupResults['cloudflare'] && <SetupCheckDisplay result={setupResults['cloudflare']} />}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runCheckSetup('cloudflare', { apiToken: cfApiToken, accountId: cfAccountId, tunnelId: cfTunnelId })}
                  disabled={checkingSetup['cloudflare'] || !cfApiToken || !cfAccountId || !cfTunnelId}
                >
                  {checkingSetup['cloudflare'] ? 'Checking...' : 'Check Setup'}
                </Button>
                <Button size="sm" onClick={saveCloudflare} disabled={!setupResults['cloudflare']?.allPassed}>
                  Save
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onNext}>
          Next
        </Button>
      </CardFooter>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Setup Complete</CardTitle>
        <CardDescription>Your HomelabMan instance is ready to use.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <h4 className="text-sm font-medium">Configuration Summary</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Admin account created</li>
            {configuredProviders.length > 0 ? (
              <li>
                Exposure providers configured: {configuredProviders.join(', ')}
              </li>
            ) : (
              <li>No exposure providers configured (can be added in Settings)</li>
            )}
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onFinish} disabled={isSubmitting}>
          {isSubmitting ? 'Finishing Setup...' : 'Get Started'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        exposureProviders.push({
          providerType: 'cloudflare',
          name: 'Cloudflare',
          enabled: true,
          configuration: {
            apiToken: providerConfig.cloudflare.apiToken,
            accountId: providerConfig.cloudflare.accountId,
            tunnelId: providerConfig.cloudflare.tunnelId,
          },
        });
      }

      await api.post('/settings/onboarding', { exposureProviders });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
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
        <h1 className="text-2xl font-bold text-center mb-2">Welcome to HomelabMan</h1>
        <p className="text-center text-muted-foreground mb-6">
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
