import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTasksNewestFirst } from './taskOrdering.js';

test('newly created tasks sort before older overdue tasks', () => {
  const newest = { task_id: -200, created_at: '2026-11-21T12:00:00.000Z' };
  const olderOverdue = { task_id: 41, created_at: '2026-11-20T12:00:00.000Z', due_date: '2026-11-01' };

  assert.ok(compareTasksNewestFirst(newest, olderOverdue) < 0);
});

test('newer local tasks sort first when creation timestamps match', () => {
  const newestLocal = { task_id: -200, created_at: '2026-11-21T12:00:00.000Z' };
  const olderLocal = { task_id: -100, created_at: '2026-11-21T12:00:00.000Z' };

  assert.ok(compareTasksNewestFirst(newestLocal, olderLocal) < 0);
});
