import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ getDatabase: vi.fn() }));

import { getDatabase } from '../../db/index.js';
import { GroupService } from '../group.service.js';

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';

function makeGroup(overrides = {}) {
  return {
    id: GROUP_ID,
    userId: USER_ID,
    name: 'My Group',
    sortOrder: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeDb(overrides: Record<string, any> = {}) {
  const returning = vi.fn().mockResolvedValue([makeGroup()]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const values = vi.fn().mockReturnValue({ returning });
  const selectFrom = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([makeGroup()]) }) });

  return {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    insert: vi.fn().mockReturnValue({ values }),
    update: vi.fn().mockReturnValue({ set }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi.fn().mockImplementation(async (fn: any) => fn({
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    })),
    ...overrides,
  };
}

describe('GroupService.listGroups', () => {
  it('returns groups ordered by sortOrder', async () => {
    const db = makeDb();
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([makeGroup()]),
        }),
      }),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    const result = await service.listGroups(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(GROUP_ID);
  });
});

describe('GroupService.createGroup', () => {
  it('inserts a group and returns it', async () => {
    const db = makeDb();
    const returning = vi.fn().mockResolvedValue([makeGroup({ name: 'New Group' })]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert = vi.fn().mockReturnValue({ values });
    // mock the select for max sortOrder
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxOrder: -1 }]),
      }),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    const result = await service.createGroup(USER_ID, 'New Group');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, name: 'New Group', sortOrder: 0 }));
    expect(result.name).toBe('New Group');
  });
});

describe('GroupService.renameGroup', () => {
  it('updates the group name', async () => {
    const db = makeDb();
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    const result = await service.renameGroup(GROUP_ID, USER_ID, 'Renamed');
    expect(db.update).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('throws when group not found', async () => {
    const db = makeDb();
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update = vi.fn().mockReturnValue({ set });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    await expect(service.renameGroup('bad-id', USER_ID, 'X')).rejects.toThrow('Group not found');
  });
});

describe('GroupService.deleteGroup', () => {
  it('runs in a transaction, nullifying projects then deleting group', async () => {
    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeGroup()]),
      }),
    });
    const txUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    const txDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const db = makeDb({
      transaction: vi.fn().mockImplementation(async (fn: any) => fn({ select: txSelect, update: txUpdate, delete: txDelete })),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    await service.deleteGroup(GROUP_ID, USER_ID);
    expect(db.transaction).toHaveBeenCalled();
    expect(txSelect).toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalled();
    expect(txDelete).toHaveBeenCalled();
  });

  it('throws when group not found', async () => {
    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = makeDb({
      transaction: vi.fn().mockImplementation(async (fn: any) => fn({ select: txSelect, update: vi.fn(), delete: vi.fn() })),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    await expect(service.deleteGroup('bad-id', USER_ID)).rejects.toThrow('Group not found');
  });
});

describe('GroupService.reorderGroups', () => {
  it('updates sortOrder for each group in a transaction', async () => {
    const txSetFns: any[] = [];
    const txUpdate = vi.fn().mockImplementation(() => {
      const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      txSetFns.push(setFn);
      return { set: setFn };
    });
    const db = makeDb({
      transaction: vi.fn().mockImplementation(async (fn: any) => fn({ update: txUpdate })),
    });
    vi.mocked(getDatabase).mockReturnValue(db as any);
    const service = new GroupService();
    await service.reorderGroups(USER_ID, ['id-a', 'id-b']);
    expect(db.transaction).toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(txSetFns[0]).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }));
    expect(txSetFns[1]).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 1 }));
  });
});
