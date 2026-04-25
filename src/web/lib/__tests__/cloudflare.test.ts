import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  buildCloudflaredComposeContent,
  deployCloudflaredProject,
  resolveCloudflareBeforeSave,
} from "../cloudflare";

vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
  },
}));

describe("cloudflare web helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds compose content with tunnel token command", () => {
    const content = buildCloudflaredComposeContent("token-123");

    expect(content).toContain("cloudflare/cloudflared:latest");
    expect(content).toContain("command: tunnel run --token token-123");
  });

  it("creates a new tunnel when tunnelId is __new__", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      tunnelId: "new-tunnel-id",
      tunnelToken: "new-tunnel-token",
    });

    const result = await resolveCloudflareBeforeSave({
      apiToken: "api-token",
      accountId: "account-id",
      tunnelId: "__new__",
      tunnelName: "labrador",
      deployContainer: true,
      adoptStackName: null,
    });

    expect(api.post).toHaveBeenCalledWith("/cloudflare/tunnels/create", {
      apiToken: "api-token",
      accountId: "account-id",
      tunnelName: "labrador",
    });
    expect(result).toEqual({
      tunnelId: "new-tunnel-id",
      tunnelToken: "new-tunnel-token",
    });
  });

  it("fetches token for existing tunnel when deployContainer is true", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      tunnelToken: "existing-token",
    });

    const result = await resolveCloudflareBeforeSave({
      apiToken: "api-token",
      accountId: "account-id",
      tunnelId: "existing-id",
      tunnelName: "",
      deployContainer: true,
      adoptStackName: null,
    });

    expect(api.post).toHaveBeenCalledWith("/cloudflare/tunnels/token", {
      apiToken: "api-token",
      accountId: "account-id",
      tunnelId: "existing-id",
    });
    expect(result).toEqual({
      tunnelId: "existing-id",
      tunnelToken: "existing-token",
    });
  });

  it("does not fetch token when deployContainer is false", async () => {
    const result = await resolveCloudflareBeforeSave({
      apiToken: "api-token",
      accountId: "account-id",
      tunnelId: "existing-id",
      tunnelName: "",
      deployContainer: false,
      adoptStackName: null,
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      tunnelId: "existing-id",
      tunnelToken: null,
    });
  });

  it("creates and deploys infrastructure project for cloudflared deployment", async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ id: "proj-123" })
      .mockResolvedValueOnce(undefined);

    await deployCloudflaredProject("infra-token");

    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenNthCalledWith(1, "/projects", {
      name: "Cloudflare Tunnel",
      composeContent: expect.stringContaining(
        "command: tunnel run --token infra-token",
      ),
      isInfrastructure: true,
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/projects/proj-123/deploy");
  });
});
