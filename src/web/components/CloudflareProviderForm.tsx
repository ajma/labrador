import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { api } from '../lib/api';

export interface CloudflareProviderFormValue {
  apiToken: string;
  accountId: string;
  tunnelId: string;      // '__new__' when user wants to create a new tunnel
  tunnelName: string;    // only used when tunnelId === '__new__'
  deployContainer: boolean;
}

interface CfAccount {
  id: string;
  name: string;
}

interface CfTunnel {
  id: string;
  name: string;
}

interface Props {
  value: CloudflareProviderFormValue;
  onChange: (value: CloudflareProviderFormValue) => void;
}

export function CloudflareProviderForm({ value, onChange }: Props) {
  const [accounts, setAccounts] = useState<CfAccount[]>([]);
  const [tunnels, setTunnels] = useState<CfTunnel[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingTunnels, setIsLoadingTunnels] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError(null);
    setAccounts([]);
    setTunnels([]);
    onChange({ ...value, accountId: '', tunnelId: '__new__', tunnelName: '' });
    try {
      const fetched = await api.post<CfAccount[]>('/cloudflare/accounts', { apiToken: value.apiToken });
      setAccounts(fetched);
      if (fetched.length === 1) {
        handleAccountChange(fetched[0].id);
      }
    } catch (err: any) {
      setConnectError(err.message ?? 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAccountChange = async (accountId: string) => {
    onChange({ ...value, accountId, tunnelId: '__new__', tunnelName: '' });
    setTunnels([]);
    if (!accountId) return;
    setIsLoadingTunnels(true);
    try {
      const fetched = await api.post<CfTunnel[]>('/cloudflare/tunnels', { apiToken: value.apiToken, accountId });
      setTunnels(fetched);
    } catch {
      // leave tunnels empty; user can still create a new one
    } finally {
      setIsLoadingTunnels(false);
    }
  };

  const handleTunnelChange = (tunnelId: string) => {
    onChange({ ...value, tunnelId, tunnelName: tunnelId === '__new__' ? value.tunnelName : '' });
  };

  return (
    <div className="space-y-4">
      {/* API Token */}
      <div className="space-y-2">
        <Label htmlFor="cf-api-token">API Token</Label>
        <div className="flex gap-2">
          <Input
            id="cf-api-token"
            type="text"
            placeholder="Enter your Cloudflare API token"
            value={value.apiToken}
            onChange={(e) => {
              setAccounts([]);
              setTunnels([]);
              setConnectError(null);
              onChange({ ...value, apiToken: e.target.value, accountId: '', tunnelId: '__new__', tunnelName: '' });
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleConnect}
            disabled={!value.apiToken || isConnecting}
          >
            {isConnecting ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
        {connectError && <p className="text-sm text-destructive">{connectError}</p>}
        {value.accountId && accounts.length === 0 && !isConnecting && (
          <p className="text-xs text-muted-foreground">
            Click Connect to reload your accounts and tunnels.
          </p>
        )}
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

      {/* Account dropdown */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="cf-account">Account</Label>
          <select
            id="cf-account"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={value.accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
          >
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tunnel dropdown */}
      {value.accountId && accounts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="cf-tunnel">Tunnel</Label>
          <select
            id="cf-tunnel"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={value.tunnelId}
            onChange={(e) => handleTunnelChange(e.target.value)}
            disabled={isLoadingTunnels}
          >
            <option value="__new__">✦ Create new tunnel…</option>
            {tunnels.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {isLoadingTunnels && <p className="text-xs text-muted-foreground">Loading tunnels…</p>}
        </div>
      )}

      {/* Tunnel name — only when creating new */}
      {value.accountId && accounts.length > 0 && value.tunnelId === '__new__' && (
        <div className="flex items-center gap-3">
          <Label htmlFor="cf-tunnel-name" className="whitespace-nowrap">Tunnel Name:</Label>
          <Input
            id="cf-tunnel-name"
            placeholder="e.g. homelab-tunnel"
            value={value.tunnelName}
            onChange={(e) => onChange({ ...value, tunnelName: e.target.value })}
          />
        </div>
      )}

      {/* Deploy checkbox */}
      {value.accountId && accounts.length > 0 && (
        <>
          <hr className="border-border" />
          <div className="flex items-start gap-3">
            <input
              id="cf-deploy-container"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={value.deployContainer}
              onChange={(e) => onChange({ ...value, deployContainer: e.target.checked })}
            />
            <label htmlFor="cf-deploy-container" className="space-y-1 cursor-pointer">
              <span className="text-sm font-medium">Deploy cloudflared container</span>
              <p className="text-xs text-muted-foreground">
                Creates a &quot;Cloudflare Tunnel&quot; project and starts the cloudflared Docker
                container using the tunnel token. Required for traffic to flow.
              </p>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
