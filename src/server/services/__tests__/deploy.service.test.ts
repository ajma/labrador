import { describe, it, expect, vi, beforeEach } from "vitest";
import yaml from "js-yaml";

vi.mock("../../db/index.js", () => ({ getDatabase: vi.fn() }));
vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getDatabase } from "../../db/index.js";
import fs from "fs/promises";
import { DeployService } from "../deploy.service.js";

const mockDockerService = {
  composeUp: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
  composeDown: vi.fn().mockResolvedValue(undefined),
  composeRestart: vi.fn().mockResolvedValue(undefined),
};

const mockProjectService = {
  getProject: vi.fn(),
};

const mockExposureService = {
  addProjectExposure: vi.fn().mockResolvedValue(undefined),
  removeProjectExposure: vi.fn().mockResolvedValue(undefined),
};

function makeDb() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { update: vi.fn().mockReturnValue({ set }), _set: set, _where: where };
}

const PROJECT = {
  id: "proj-1",
  slug: "my-app",
  name: "My App",
  composeContent: "services:\n  web:\n    image: nginx:latest\n",
  logoUrl: null,
  exposureEnabled: false,
  status: "stopped",
};

describe("injectLabels", () => {
  let service: DeployService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DeployService(
      mockDockerService as any,
      mockProjectService as any,
    );
  });

  it("adds labrador.managed and project_id labels to each service", () => {
    const input = "services:\n  web:\n    image: nginx:latest\n";
    const result = (service as any).injectLabels(input, "proj-1");
    const parsed = yaml.load(result) as any;

    expect(parsed.services.web.labels["labrador.managed"]).toBe("true");
    expect(parsed.services.web.labels["labrador.project_id"]).toBe("proj-1");
  });

  it("preserves existing object-format labels", () => {
    const input =
      'services:\n  web:\n    image: nginx\n    labels:\n      foo: "bar"\n';
    const result = (service as any).injectLabels(input, "proj-1");
    const parsed = yaml.load(result) as any;

    expect(parsed.services.web.labels.foo).toBe("bar");
    expect(parsed.services.web.labels["labrador.managed"]).toBe("true");
    expect(parsed.services.web.labels["labrador.project_id"]).toBe("proj-1");
  });

  it("handles array-format labels", () => {
    const input =
      "services:\n  web:\n    image: nginx\n    labels:\n      - existing=value\n";
    const result = (service as any).injectLabels(input, "proj-1");
    const parsed = yaml.load(result) as any;

    expect(parsed.services.web.labels).toContain("existing=value");
    expect(parsed.services.web.labels).toContain("labrador.managed=true");
    expect(parsed.services.web.labels).toContain("labrador.project_id=proj-1");
  });

  it("adds logo_url label when logoUrl provided", () => {
    const input = "services:\n  web:\n    image: nginx\n";
    const result = (service as any).injectLabels(
      input,
      "proj-1",
      "https://example.com/logo.png",
    );
    const parsed = yaml.load(result) as any;

    expect(parsed.services.web.labels["labrador.logo_url"]).toBe(
      "https://example.com/logo.png",
    );
  });

  it("skips logo_url when logoUrl is null", () => {
    const input = "services:\n  web:\n    image: nginx\n";
    const result = (service as any).injectLabels(input, "proj-1", null);
    const parsed = yaml.load(result) as any;

    expect(parsed.services.web.labels["labrador.logo_url"]).toBeUndefined();
  });
});

describe("deploy", () => {
  let service: DeployService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    (getDatabase as any).mockReturnValue(db);
    mockProjectService.getProject.mockResolvedValue({ ...PROJECT });
    service = new DeployService(
      mockDockerService as any,
      mockProjectService as any,
    );
    service.setExposureService(mockExposureService as any);
  });

  it("writes compose file to /tmp/labrador/{slug}/docker-compose.yml", async () => {
    await service.deploy("proj-1", "user-1");

    expect(fs.mkdir).toHaveBeenCalledWith("/tmp/labrador/my-app", {
      recursive: true,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/labrador/my-app/docker-compose.yml",
      expect.any(String),
    );
  });

  it("calls composeUp with correct file path and slug", async () => {
    await service.deploy("proj-1", "user-1");

    expect(mockDockerService.composeUp).toHaveBeenCalledWith(
      "/tmp/labrador/my-app/docker-compose.yml",
      "my-app",
    );
  });

  it('updates project status to "running" on success', async () => {
    await service.deploy("proj-1", "user-1");

    // The second .set() call is the "running" update (first is "starting")
    const setCalls = db._set.mock.calls;
    const runningCall = setCalls.find(
      (call: any[]) => call[0].status === "running",
    );
    expect(runningCall).toBeDefined();
    expect(runningCall![0].deployedAt).toBeTypeOf("number");
  });

  it("calls addProjectExposure when exposureService is set", async () => {
    await service.deploy("proj-1", "user-1");

    expect(mockExposureService.addProjectExposure).toHaveBeenCalledWith(
      "proj-1",
    );
  });

  it('sets status to "error" and rethrows on docker failure', async () => {
    mockDockerService.composeUp.mockRejectedValueOnce(
      new Error("compose failed"),
    );

    await expect(service.deploy("proj-1", "user-1")).rejects.toThrow(
      "compose failed",
    );

    const setCalls = db._set.mock.calls;
    const errorCall = setCalls.find(
      (call: any[]) => call[0].status === "error",
    );
    expect(errorCall).toBeDefined();
  });

  it("calls listener callbacks at each stage", async () => {
    const listener = {
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await service.deploy("proj-1", "user-1", listener);

    expect(listener.onProgress).toHaveBeenCalledWith(
      "preparing",
      expect.any(String),
    );
    expect(listener.onProgress).toHaveBeenCalledWith(
      "deploying",
      expect.any(String),
    );
    expect(listener.onComplete).toHaveBeenCalledWith("success");
    expect(listener.onError).not.toHaveBeenCalled();
  });

  it("does not fail deploy when exposure setup fails", async () => {
    mockExposureService.addProjectExposure.mockRejectedValueOnce(
      new Error("exposure boom"),
    );

    await expect(service.deploy("proj-1", "user-1")).resolves.toBeUndefined();

    expect(mockDockerService.composeUp).toHaveBeenCalled();
  });

  it("throws when project not found", async () => {
    mockProjectService.getProject.mockResolvedValueOnce(null);

    await expect(service.deploy("proj-1", "user-1")).rejects.toThrow(
      "Project not found",
    );
  });
});

describe("stop", () => {
  let service: DeployService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    (getDatabase as any).mockReturnValue(db);
    mockProjectService.getProject.mockResolvedValue({ ...PROJECT });
    service = new DeployService(
      mockDockerService as any,
      mockProjectService as any,
    );
    service.setExposureService(mockExposureService as any);
  });

  it("calls removeProjectExposure then composeDown", async () => {
    const callOrder: string[] = [];
    mockExposureService.removeProjectExposure.mockImplementation(async () => {
      callOrder.push("removeExposure");
    });
    mockDockerService.composeDown.mockImplementation(async () => {
      callOrder.push("composeDown");
    });

    await service.stop("proj-1", "user-1");

    expect(callOrder).toEqual(["removeExposure", "composeDown"]);
  });

  it('sets project status to "stopped"', async () => {
    await service.stop("proj-1", "user-1");

    const setCalls = db._set.mock.calls;
    const stoppedCall = setCalls.find(
      (call: any[]) => call[0].status === "stopped",
    );
    expect(stoppedCall).toBeDefined();
  });

  it("throws when project not found", async () => {
    mockProjectService.getProject.mockResolvedValueOnce(null);

    await expect(service.stop("proj-1", "user-1")).rejects.toThrow(
      "Project not found",
    );
  });

  it("does not fail when composeDown throws", async () => {
    mockDockerService.composeDown.mockRejectedValueOnce(
      new Error("compose down failed"),
    );

    await expect(service.stop("proj-1", "user-1")).resolves.toBeUndefined();

    const setCalls = db._set.mock.calls;
    const stoppedCall = setCalls.find(
      (call: any[]) => call[0].status === "stopped",
    );
    expect(stoppedCall).toBeDefined();
  });

  it("does not fail when removeProjectExposure throws", async () => {
    mockExposureService.removeProjectExposure.mockRejectedValueOnce(
      new Error("exposure removal failed"),
    );

    await expect(service.stop("proj-1", "user-1")).resolves.toBeUndefined();

    expect(mockDockerService.composeDown).toHaveBeenCalled();
  });
});

describe("restart", () => {
  let service: DeployService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    (getDatabase as any).mockReturnValue(db);
    mockProjectService.getProject.mockResolvedValue({ ...PROJECT });
    service = new DeployService(
      mockDockerService as any,
      mockProjectService as any,
    );
  });

  it('calls composeRestart and sets status to "running"', async () => {
    await service.restart("proj-1", "user-1");

    expect(mockDockerService.composeRestart).toHaveBeenCalledWith(
      "/tmp/labrador/my-app/docker-compose.yml",
      "my-app",
    );

    const setCalls = db._set.mock.calls;
    const runningCall = setCalls.find(
      (call: any[]) => call[0].status === "running",
    );
    expect(runningCall).toBeDefined();
  });

  it("throws when project not found", async () => {
    mockProjectService.getProject.mockResolvedValueOnce(null);

    await expect(service.restart("proj-1", "user-1")).rejects.toThrow(
      "Project not found",
    );
  });
});
