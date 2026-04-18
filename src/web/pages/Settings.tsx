import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
import { toast } from 'sonner';
import { exposureProviderSchema, type ExposureProviderInput } from '@shared/schemas';
import type { ExposureProviderConfig, Settings as SettingsType } from '@shared/types';
import { api } from '../lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

function ProviderForm({
  provider,
  onSave,
  onCancel,
  isPending,
}: {
  provider?: ExposureProviderConfig;
  onSave: (data: ExposureProviderInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [providerType, setProviderType] = useState<'caddy' | 'cloudflare'>(
    (provider?.providerType as 'caddy' | 'cloudflare') ?? 'caddy',
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ExposureProviderInput>({
    resolver: zodResolver(exposureProviderSchema),
    defaultValues: {
      providerType: (provider?.providerType as 'caddy' | 'cloudflare') ?? 'caddy',
      name: provider?.name ?? '',
      enabled: provider?.enabled ?? true,
      configuration: provider?.configuration ?? {},
    },
  });

  const currentConfig = watch('configuration');

  const handleTypeChange = (type: 'caddy' | 'cloudflare') => {
    setProviderType(type);
    setValue('providerType', type);
    setValue('configuration', type === 'caddy' ? { apiUrl: 'http://localhost:2019' } : {});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{provider ? 'Edit Provider' : 'Add Provider'}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSave)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-type">Type</Label>
            <select
              id="provider-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={providerType}
              onChange={(e) => handleTypeChange(e.target.value as 'caddy' | 'cloudflare')}
              disabled={!!provider}
            >
              <option value="caddy">Caddy</option>
              <option value="cloudflare">Cloudflare</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input
              id="provider-name"
              placeholder="e.g. My Caddy Server"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {providerType === 'caddy' && (
            <div className="space-y-2">
              <Label htmlFor="caddy-api-url">API URL</Label>
              <Input
                id="caddy-api-url"
                placeholder="http://localhost:2019"
                value={(currentConfig as Record<string, string>).apiUrl ?? ''}
                onChange={(e) => setValue('configuration', { apiUrl: e.target.value })}
              />
            </div>
          )}

          {providerType === 'cloudflare' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cf-api-token">API Token</Label>
                <Input
                  id="cf-api-token"
                  type="password"
                  placeholder="Enter your Cloudflare API token"
                  value={(currentConfig as Record<string, string>).apiToken ?? ''}
                  onChange={(e) =>
                    setValue('configuration', { ...currentConfig, apiToken: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Create an API token with <strong>Account → Cloudflare Tunnel → Edit</strong> permissions.
                  Go to Cloudflare Dashboard → Profile → API Tokens → Create Custom Token.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cf-account-id">Account ID</Label>
                <Input
                  id="cf-account-id"
                  placeholder="Enter your Account ID"
                  value={(currentConfig as Record<string, string>).accountId ?? ''}
                  onChange={(e) =>
                    setValue('configuration', { ...currentConfig, accountId: e.target.value })
                  }
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
                  value={(currentConfig as Record<string, string>).tunnelId ?? ''}
                  onChange={(e) =>
                    setValue('configuration', { ...currentConfig, tunnelId: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Found in Cloudflare Zero Trust → Networks → Tunnels. Select your tunnel to see the ID.
                </p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function Settings() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<ExposureProviderConfig | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [setupResults, setSetupResults] = useState<Record<string, ProviderSetupResult>>({});
  const [checkingSetup, setCheckingSetup] = useState<Record<string, boolean>>({});

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
      setIsAddingProvider(false);
      toast.success('Provider added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add provider');
    },
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExposureProviderInput }) =>
      api.put(`/settings/exposure-providers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditingProvider(null);
      toast.success('Provider updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update provider');
    },
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/exposure-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Provider deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete provider');
    },
  });

  const setDefaultProvider = useMutation({
    mutationFn: (providerId: string | null) =>
      api.put('/settings', { defaultExposureProviderId: providerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Default provider updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update default provider');
    },
  });

  const providers = providersQuery.data ?? [];
  const settings = settingsQuery.data;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Exposure Providers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Exposure Providers</h3>
            <p className="text-sm text-muted-foreground">
              Configure how your services are exposed to the internet.
            </p>
          </div>
          {!isAddingProvider && !editingProvider && (
            <Button onClick={() => setIsAddingProvider(true)}>Add Provider</Button>
          )}
        </div>

        {/* Add Provider Form */}
        {isAddingProvider && (
          <ProviderForm
            onSave={(data) => createProvider.mutate(data)}
            onCancel={() => setIsAddingProvider(false)}
            isPending={createProvider.isPending}
          />
        )}

        {/* Edit Provider Form */}
        {editingProvider && (
          <ProviderForm
            provider={editingProvider}
            onSave={(data) => updateProvider.mutate({ id: editingProvider.id, data })}
            onCancel={() => setEditingProvider(null)}
            isPending={updateProvider.isPending}
          />
        )}

        {/* Providers List */}
        {providersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading providers...</p>
        ) : providers.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <p className="text-center text-muted-foreground">
                No exposure providers configured. Add one to enable service exposure.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                      <CardDescription>
                        {provider.providerType === 'caddy' ? 'Caddy Reverse Proxy' : 'Cloudflare Tunnel'}
                        {!provider.enabled && ' (disabled)'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {settings?.defaultExposureProviderId === provider.id ? (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">
                          Default
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultProvider.mutate(provider.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runCheckSetup(provider)}
                        disabled={checkingSetup[provider.id]}
                      >
                        {checkingSetup[provider.id] ? 'Checking...' : 'Check Setup'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsAddingProvider(false);
                          setEditingProvider(provider);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this provider?')) {
                            deleteProvider.mutate(provider.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {setupResults[provider.id] && (
                  <CardContent className="pt-0">
                    <SetupCheckDisplay result={setupResults[provider.id]} />
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Default Provider Selector */}
        {providers.length > 0 && settings?.defaultExposureProviderId && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDefaultProvider.mutate(null)}
            >
              Clear default provider
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
