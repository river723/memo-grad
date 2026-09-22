import { mergePulledEntities } from '../services/syncMerge';

const keyOf = (e: any) => e?.id;

/** 构造一行本地/远端记录。 */
function row(id: string, opts: { dirty?: boolean; updated_at?: string; value?: number } = {}) {
  return {
    id,
    dirty: opts.dirty ?? false,
    updated_at: opts.updated_at ?? '2026-09-22T00:00:00.000Z',
    value: opts.value ?? 0,
  };
}

describe('mergePulledEntities 远端合并', () => {
  test('本地无匹配 → 追加为新记录且 dirty 置 false', () => {
    const out = mergePulledEntities([], [row('w1', { dirty: true, value: 1 })], keyOf);
    expect(out).toEqual([row('w1', { dirty: false, value: 1 })]);
  });

  test('本地已有匹配 → 以远端内容覆盖（保留原有行为）', () => {
    const out = mergePulledEntities([row('w1', { value: 0 })], [row('w1', { value: 9 })], keyOf);
    expect(out).toEqual([row('w1', { value: 9 })]);
  });

  test('非 dirty + 本地时钟比服务器慢 → 接受远端', () => {
    const out = mergePulledEntities(
      [row('w1', { updated_at: '2026-09-21T00:00:00.000Z', value: 0 })],
      [row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 })],
      keyOf
    );
    expect(out).toEqual([row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 })]);
  });

  test('★ 非 dirty + 本地时钟比服务器快 → 仍接受远端（修复点）', () => {
    // 设备时钟偏快：本地 updated_at 晚于服务器 @updatedAt。
    // 旧实现会因 >= 比较失败而静默拒绝，且 dirty 已清 false、永不重试 → 永久丢更新。
    const local = row('w1', { updated_at: '2026-09-23T00:00:00.000Z', value: 0 });
    const remote = row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 });
    const out = mergePulledEntities([local], [remote], keyOf);
    expect(out).toEqual([remote]);
  });

  test('非 dirty + 本地无 updated_at → 接受远端', () => {
    const out = mergePulledEntities(
      [row('w1', { updated_at: undefined as any, value: 0 })],
      [row('w1', { value: 9 })],
      keyOf
    );
    expect(out).toEqual([row('w1', { value: 9 })]);
  });

  test('dirty + 远端不早于本地 → 接受远端并清 dirty（原有行为）', () => {
    const out = mergePulledEntities(
      [row('w1', { dirty: true, updated_at: '2026-09-21T00:00:00.000Z', value: 0 })],
      [row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 })],
      keyOf
    );
    expect(out).toEqual([row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 })]);
  });

  test('dirty + 远端早于本地 → 保留本地行与 dirty 标记（原有行为）', () => {
    const local = row('w1', { dirty: true, updated_at: '2026-09-23T00:00:00.000Z', value: 0 });
    const out = mergePulledEntities(
      [local],
      [row('w1', { updated_at: '2026-09-22T00:00:00.000Z', value: 9 })],
      keyOf
    );
    expect(out).toEqual([local]);
  });

  test('同一键的重复本地行：后写入的行索引生效（沿用原 Map 语义）', () => {
    const out = mergePulledEntities(
      [row('w1', { value: 1 }), row('w1', { value: 2 })],
      [row('w1', { value: 9 })],
      keyOf
    );
    // Map.set 覆盖，键指向第二行
    expect(out[0].value).toBe(1);
    expect(out[1].value).toBe(9);
  });

  test('keyOf 返回 undefined 的行不参与匹配，远端同内容行会被追加', () => {
    const out = mergePulledEntities([row('', { value: 0 })], [row('', { value: 9 })], keyOf);
    expect(out).toHaveLength(2);
  });

  test('纯函数：不修改入参 locals', () => {
    const locals = [row('w1', { value: 0 })];
    mergePulledEntities(locals, [row('w1', { value: 9 })], keyOf);
    expect(locals).toEqual([row('w1', { value: 0 })]);
  });
});
