import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from './ui/input';
import { api } from '../lib/api';

export interface CloudflareProviderFormValue {
  apiToken: string;
  accountId: string;
  tunnelId: string;      // '__new__' when user wants to create a new tunnel
  tunnelName: string;    // only used when tunnelId === '__new__'
  deployContainer: boolean;
  adoptStackName: string | null;
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
  detectedStack?: { stackName: string; providerType: string } | null;
}

const selectCls =
  'w-full appearance-none rounded-[14px] border border-white/[0.20] bg-[rgba(4,7,15,0.78)] px-4 py-2 text-md text-[rgba(255,255,255,0.85)] outline-none transition-colors focus:border-[rgba(100,158,245,0.5)] pr-9';

export function CloudflareProviderForm({ value, onChange, detectedStack }: Props) {
  const [accounts, setAccounts] = useState<CfAccount[]>([]);
  const [tunnels, setTunnels] = useState<CfTunnel[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingTunnels, setIsLoadingTunnels] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const preselectedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!preselectedRef.current && detectedStack && accounts.length > 0) {
      preselectedRef.current = true;
      onChangeRef.current({ ...valueRef.current, adoptStackName: detectedStack.stackName, deployContainer: false });
    }
  }, [detectedStack, accounts.length]);

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
      <div className="space-y-1.5">
        <label htmlFor="cf-api-token" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
          API Token
        </label>
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
          <button
            type="button"
            onClick={handleConnect}
            disabled={!value.apiToken || isConnecting}
            className="shrink-0 rounded-xl border border-[rgba(100,158,245,0.4)] px-3 py-1.5 text-sm text-[#7db0ff] transition-colors hover:bg-[rgba(100,158,245,0.08)] disabled:opacity-40"
          >
            {isConnecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {connectError && (
          <p className="text-xs text-[rgba(254,202,202,0.85)]">{connectError}</p>
        )}
        {value.accountId && accounts.length === 0 && !isConnecting && (
          <p className="text-xs text-[rgba(255,255,255,0.35)]">
            Click Connect to reload your accounts and tunnels.
          </p>
        )}
        <div className="space-y-1 text-xs text-[rgba(255,255,255,0.38)]">
          <p>
            Create an API token (
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7db0ff] hover:underline"
            >
              Open Cloudflare dashboard
            </a>
            ) with these permissions:
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><span className="text-[rgba(255,255,255,0.55)]">Account → Cloudflare Tunnel → Edit</span></li>
            <li><span className="text-[rgba(255,255,255,0.55)]">Account → Account Settings → Read</span></li>
            <li><span className="text-[rgba(255,255,255,0.55)]">Zone → Zone → Read</span></li>
            <li><span className="text-[rgba(255,255,255,0.55)]">Zone → DNS → Edit</span></li>
          </ul>
        </div>
      </div>

      {/* Account dropdown */}
      {accounts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="cf-account" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
              Account
            </label>
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.65)] disabled:opacity-40"
            >
              {isConnecting ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="relative">
            <select
              id="cf-account"
              className={selectCls}
              value={value.accountId}
              onChange={(e) => handleAccountChange(e.target.value)}
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.35)]" />
          </div>
        </div>
      )}

      {/* Tunnel dropdown */}
      {value.accountId && accounts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="cf-tunnel" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
              Tunnel
            </label>
            <button
              type="button"
              onClick={() => handleAccountChange(value.accountId)}
              disabled={isLoadingTunnels}
              className="text-xs text-[rgba(255,255,255,0.35)] transition-colors hover:text-[rgba(255,255,255,0.65)] disabled:opacity-40"
            >
              {isLoadingTunnels ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="relative">
            <select
              id="cf-tunnel"
              className={selectCls}
              value={value.tunnelId}
              onChange={(e) => handleTunnelChange(e.target.value)}
              disabled={isLoadingTunnels}
            >
              <option value="__new__">✦ Create new tunnel…</option>
              {tunnels.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(255,255,255,0.35)]" />
          </div>
          {isLoadingTunnels && (
            <p className="text-xs text-[rgba(255,255,255,0.35)]">Loading tunnels…</p>
          )}
        </div>
      )}

      {/* Tunnel name — only when creating new */}
      {value.accountId && accounts.length > 0 && value.tunnelId === '__new__' && (
        <div className="space-y-1.5">
          <label htmlFor="cf-tunnel-name" className="text-xs font-medium text-[rgba(255,255,255,0.6)]">
            Tunnel Name
          </label>
          <Input
            id="cf-tunnel-name"
            placeholder="e.g. homelab-tunnel"
            value={value.tunnelName}
            onChange={(e) => onChange({ ...value, tunnelName: e.target.value })}
          />
        </div>
      )}

      {value.accountId && accounts.length > 0 && (
        <>
          <div className="border-t border-white/[0.08]" />
          {detectedStack ? (
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-[rgba(255,255,255,0.6)]">cloudflared container</p>
              {[
                {
                  key: 'adopt',
                  label: `Adopt existing container (${detectedStack.stackName})`,
                  description: 'Register the running cloudflared stack as a Labrador infrastructure project.',
                  checked: value.adoptStackName !== null,
                  onSelect: () =>
                    onChange({ ...value, adoptStackName: detectedStack.stackName, deployContainer: false }),
                },
                {
                  key: 'deploy',
                  label: 'Deploy new container',
                  description: 'Create a new "Cloudflare Tunnel" project and start a fresh cloudflared container.',
                  checked: value.adoptStackName === null && value.deployContainer,
                  onSelect: () => onChange({ ...value, adoptStackName: null, deployContainer: true }),
                },
                {
                  key: 'none',
                  label: 'Neither',
                  description: 'I will manage cloudflared myself.',
                  checked: value.adoptStackName === null && !value.deployContainer,
                  onSelect: () => onChange({ ...value, adoptStackName: null, deployContainer: false }),
                },
              ].map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="cf-container-setup"
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-[#649ef5]"
                    checked={opt.checked}
                    onChange={opt.onSelect}
                  />
                  <span className="space-y-0.5">
                    <span className="text-sm font-medium text-[rgba(255,255,255,0.75)]">{opt.label}</span>
                    <p className="text-xs text-[rgba(255,255,255,0.38)]">{opt.description}</p>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <input
                id="cf-deploy-container"
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer accent-[#649ef5]"
                checked={value.deployContainer}
                onChange={(e) => onChange({ ...value, deployContainer: e.target.checked })}
              />
              <label htmlFor="cf-deploy-container" className="cursor-pointer space-y-0.5">
                <span className="text-sm font-medium text-[rgba(255,255,255,0.75)]">
                  Deploy cloudflared container
                </span>
                <p className="text-xs text-[rgba(255,255,255,0.38)]">
                  Creates a &quot;Cloudflare Tunnel&quot; project and starts the cloudflared Docker container
                  using the tunnel token. Required for traffic to flow.
                </p>
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
