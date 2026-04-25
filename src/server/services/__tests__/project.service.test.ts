import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("../../db/index.js", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "../../db/index.js";
import { ProjectService } from "../project.service.js";

const USER_ID = "user-1";
const PROJECT_ID = "proj-1";

function makeProject(overrides = {}) {
  return {
    id: PROJECT_ID,
    userId: USER_ID,
    name: "My App",
    slug: "my-app",
    composeContent: "services:\n  web:\n    image: nginx\n",
    logoUrl: null,
    domainName: null,
    exposureEnabled: false,
    exposureProviderId: null,
    exposureConfig: "{}",
    isInfrastructure: false,
    groupId: null,
    sortOrder: 0,
    status: "stopped",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeDb(overrides: Record<string, any> = {}) {
  const returning = vi.fn().mockResolvedValue([makeProject()]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const values = vi.fn().mockReturnValue({ returning });
  const selectFrom = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([makeProject()]),
  });

  return {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    insert: vi.fn().mockReturnValue({ values }),
    update: vi.fn().mockReturnValue({ set }),
    delete: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi.fn().mockImplementation(async (fn: any) =>
      fn({
        update: vi.fn().mockReturnValue({
          set: vi
            .fn()
            .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      }),
    ),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("ProjectService.createProject", () => {
  it("generates slug from name", async () => {
    const db = makeDb();
    // First select (slug collision check) returns empty — no collision
    const slugCheckWhere = vi.fn().mockResolvedValue([]);
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: slugCheckWhere }),
    });
    const returning = vi.fn().mockResolvedValue([makeProject()]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await service.createProject(USER_ID, {
      name: "My App",
      sortOrder: 0,
      composeContent: "services:\n  web:\n    image: nginx\n",
      exposureEnabled: false,
      exposureConfig: {},
      isInfrastructure: false,
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "my-app" }),
    );
  });

  it("appends random hex suffix when slug already exists", async () => {
    const db = makeDb();
    // Slug collision check returns an existing row
    const slugCheckWhere = vi.fn().mockResolvedValue([makeProject()]);
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: slugCheckWhere }),
    });
    const returning = vi
      .fn()
      .mockResolvedValue([makeProject({ slug: "my-app-aabbcc" })]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    vi.spyOn(crypto, "randomBytes").mockReturnValue(
      Buffer.from("aabbcc", "hex") as any,
    );

    const service = new ProjectService();
    await service.createProject(USER_ID, {
      name: "My App",
      sortOrder: 0,
      composeContent: "services:\n  web:\n    image: nginx\n",
      exposureEnabled: false,
      exposureConfig: {},
      isInfrastructure: false,
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "my-app-aabbcc" }),
    );
  });

  it("passes all fields including defaults to db insert", async () => {
    const db = makeDb();
    const slugCheckWhere = vi.fn().mockResolvedValue([]);
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: slugCheckWhere }),
    });
    const returning = vi.fn().mockResolvedValue([makeProject()]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await service.createProject(USER_ID, {
      name: "My App",
      sortOrder: 0,
      composeContent: "services:\n  web:\n    image: nginx\n",
      exposureEnabled: false,
      exposureConfig: {},
      isInfrastructure: false,
    });

    expect(values).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "My App",
      slug: "my-app",
      composeContent: "services:\n  web:\n    image: nginx\n",
      logoUrl: null,
      domainName: null,
      exposureEnabled: false,
      exposureProviderId: null,
      exposureConfig: "{}",
      isInfrastructure: false,
      groupId: null,
      sortOrder: 0,
    });
  });
});

describe("ProjectService.getProject", () => {
  it("returns project when found", async () => {
    const db = makeDb();
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    const result = await service.getProject(PROJECT_ID, USER_ID);

    expect(result).toEqual(makeProject());
    expect(db.select).toHaveBeenCalled();
  });

  it("returns null when not found", async () => {
    const db = makeDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    const result = await service.getProject("nonexistent", USER_ID);

    expect(result).toBeNull();
  });
});

describe("ProjectService.updateProject", () => {
  it("throws 'Project not found' when getProject returns null", async () => {
    const db = makeDb();
    // getProject select returns empty
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await expect(
      service.updateProject("bad-id", USER_ID, { name: "Updated" }),
    ).rejects.toThrow("Project not found");
  });

  it("updates and returns project row", async () => {
    const updated = makeProject({ name: "Updated App" });
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });

    const db = makeDb();
    db.update = vi.fn().mockReturnValue({ set });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    const result = await service.updateProject(PROJECT_ID, USER_ID, {
      name: "Updated App",
    });

    expect(db.update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated App" }),
    );
    expect(result.name).toBe("Updated App");
  });
});

describe("ProjectService.deleteProject", () => {
  it("throws 'Project not found' when getProject returns null", async () => {
    const db = makeDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await expect(service.deleteProject("bad-id", USER_ID)).rejects.toThrow(
      "Project not found",
    );
  });

  it("deletes containerStats, containerUpdates, then project", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });

    // First call is getProject (select), needs to return a project
    const db = makeDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeProject()]),
      }),
    });
    db.delete = deleteFn;
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await service.deleteProject(PROJECT_ID, USER_ID);

    expect(deleteFn).toHaveBeenCalledTimes(3);
  });
});

describe("ProjectService.reorderProjects", () => {
  it("calls transaction and updates each project inside it", async () => {
    const txSetFns: any[] = [];
    const txUpdate = vi.fn().mockImplementation(() => {
      const setFn = vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      txSetFns.push(setFn);
      return { set: setFn };
    });
    const db = makeDb({
      transaction: vi
        .fn()
        .mockImplementation(async (fn: any) => fn({ update: txUpdate })),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);

    const service = new ProjectService();
    await service.reorderProjects(USER_ID, [
      { id: "proj-a", groupId: null, sortOrder: 0 },
      { id: "proj-b", groupId: "group-1", sortOrder: 1 },
    ]);

    expect(db.transaction).toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(txSetFns[0]).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: null, sortOrder: 0 }),
    );
    expect(txSetFns[1]).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "group-1", sortOrder: 1 }),
    );
  });
});
