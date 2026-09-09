import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyState } from '../shared/model';
import {
  deleteState,
  parseBackup,
  readState,
  writeState,
} from '../src/storage';
import { demoState } from '../src/demo';
import { game } from './fixtures';
afterEach(deleteState);
describe('durable local state', () => {
  it('restores a selected result, custom games and filters after reopening storage', async () => {
    const state = emptyState();
    const custom = {
      ...game('custom:one'),
      kind: 'custom' as const,
      platform: 'Other launcher',
    };
    state.customGames = [custom];
    state.rolls = [
      { id: 'roll', game: custom, poolSize: 1, at: new Date().toISOString() },
    ];
    state.used = [custom.id];
    state.filters.instant = true;
    await writeState(state);
    expect(await readState()).toEqual(state);
  });
  it('round-trips full JSON exports', () => {
    const state = demoState(emptyState());
    expect(parseBackup(JSON.stringify(state))).toEqual(state);
  });
  it('rejects malformed and unsafe imports without altering saved data', async () => {
    const state = emptyState();
    await writeState(state);
    expect(() => parseBackup('{broken')).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...state,
          customGames: [
            {
              ...game('custom:one'),
              kind: 'custom',
              image: 'javascript:alert(1)',
            },
          ],
        }),
      ),
    ).toThrow();
    expect(await readState()).toEqual(state);
  });
  it('keeps real data behind the demo', () => {
    const real = emptyState();
    real.favorites = ['steam:620'];
    const demo = demoState(real);
    expect(demo.liveBackup?.favorites).toEqual(['steam:620']);
    expect(demo.mode).toBe('demo');
    expect(real.mode).toBe('live');
  });
  it('clears saved data explicitly', async () => {
    const state = demoState(emptyState());
    await writeState(state);
    await deleteState();
    expect(await readState()).toEqual(emptyState());
  });
});
