export class MockCloudflareApiService {
  accounts: { id: string; name: string }[] = [];
  tunnels: { id: string; name: string }[] = [];
  nextTunnel = { tunnelId: 'tunnel-test', tunnelToken: 'token-test' };

  reset() {
    this.accounts = [];
    this.tunnels = [];
    this.nextTunnel = { tunnelId: 'tunnel-test', tunnelToken: 'token-test' };
  }

  async listAccounts(_apiToken: string) { return this.accounts; }
  async listTunnels(_apiToken: string, _accountId: string) { return this.tunnels; }
  async createTunnel(_apiToken: string, _accountId: string, _name: string) {
    return this.nextTunnel;
  }
  async getTunnelToken(_apiToken: string, _accountId: string, _tunnelId: string) {
    return { tunnelToken: this.nextTunnel.tunnelToken };
  }
}
