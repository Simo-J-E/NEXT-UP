import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Download,
  Gamepad2,
  Library as LibraryIcon,
  Plus,
  Settings2,
  SlidersHorizontal,
  Star,
  Upload,
  X,
} from 'lucide-react';
import {
  dateLabel,
  storeKey,
  type Game,
  type Item,
  type Price,
  type State,
} from '../shared/model';
import { api, ClientError, type Health } from './api';
import { demoState } from './demo';
import { parseBackup } from './storage';
import { useStore } from './useStore';
import { Artwork, Modal, Toggle } from './components/Primitives';
import { Wheel } from './components/Wheel';
import { LibraryView } from './components/LibraryView';
import { InventoryView } from './components/InventoryView';

type View = 'play' | 'library' | 'inventory';
function currentView(): View {
  const hash = location.hash.slice(1);
  return hash === 'library' || hash === 'inventory' ? hash : 'play';
}
function leaveDemo(state: State): State {
  return state.mode === 'demo'
    ? {
        ...(state.liveBackup || emptyState()),
        mode: 'live',
        customGames: state.customGames,
        liveBackup: null,
      }
    : state;
}
export default function App() {
  const { state, current, ready, storageError, update, clear } = useStore();
  const [view, setView] = useState<View>(currentView),
    [profileInput, setProfileInput] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false),
    [priceBusy, setPriceBusy] = useState(false),
    [inventoryBusy, setInventoryBusy] = useState(false),
    [wheelBusy, setWheelBusy] = useState(false);
  const [notice, setNotice] = useState(''),
    [dialog, setDialog] = useState<'custom' | 'settings' | 'privacy' | null>(
      null,
    );
  const [health, setHealth] = useState<Health | null>(null),
    [appId, setAppId] = useState(730);
  const controller = useRef<AbortController | null>(null),
    pending = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handle = () => {
      if (location.hash !== '#main') setView(currentView());
    };
    window.addEventListener('hashchange', handle);
    api
      .health()
      .then(setHealth)
      .catch(() => undefined);
    return () => {
      window.removeEventListener('hashchange', handle);
      controller.current?.abort();
    };
  }, []);
  const games = [...(state.library?.games || []), ...state.customGames];
  const eligible = eligibleGames(
    games,
    state.filters,
    state.favorites,
    state.excluded,
    state.used,
  );
  const navigate = (next: View) => {
    location.hash = next;
    setView(next);
  };
  const toggleList = (list: 'favorites' | 'excluded', id: string) => {
    void update((old) => ({
      ...old,
      [list]: old[list].includes(id)
        ? old[list].filter((x) => x !== id)
        : [...old[list], id],
    }));
  };
  function exportData() {
    const blob = new Blob([JSON.stringify(current.current, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `next-up-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      const next = parseBackup(await file.text());
      if (
        !window.confirm(
          `Replace local data with ${next.customGames.length} custom games and ${next.rolls.length} saved rolls from this backup?`,
        )
      )
        return;
      await update(() => next);
      setNotice('Backup imported.');
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'Could not import this backup.',
      );
    }
    if (importInput.current) importInput.current.value = '';
  }
  async function loadProfile(event: FormEvent) {
    event.preventDefault();
    if (pending.current || loadingProfile) return;
    try {
      parseProfile(profileInput);
      setLoadingProfile(true);
      setNotice('');
      const loaded = await api.profile(profileInput);
      await update((old) => {
        const real = leaveDemo(old),
          same = real.library?.profile.steamId === loaded.profile.steamId;
        return {
          ...real,
          library: loaded,
          inventories: same ? real.inventories : {},
          prices: same ? real.prices : {},
          rolls: same ? real.rolls : [],
          used: same ? real.used : [],
        };
      });
      setNotice(
        loaded.message ||
          `${loaded.games.length} games loaded. Ready when you are.`,
      );
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'Could not load that profile.',
      );
    } finally {
      setLoadingProfile(false);
    }
  }
  async function savePrices(prices: Price[]) {
    await update((old) => ({
      ...old,
      prices: {
        ...old.prices,
        ...Object.fromEntries(prices.map((p) => [p.key, p])),
      },
      library: old.library
        ? {
            ...old.library,
            games: old.library.games.map((g) => {
              const p = prices.find((p) => p.key === storeKey(g.appId || 0));
              return p?.image ? { ...g, image: p.image } : g;
            }),
          }
        : null,
    }));
  }
  async function loadStorePrices() {
    if (pending.current || state.mode === 'demo') return;
    pending.current = true;
    setPriceBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const ids = [...new Set(games.flatMap((g) => (g.appId ? [g.appId] : [])))];
    try {
      for (let i = 0; i < ids.length; i += 8) {
        const { prices } = await api.store(ids.slice(i, i + 8), abort.signal);
        await savePrices(prices);
        setNotice(
          `Store prices checked: ${Math.min(i + 8, ids.length)} / ${ids.length}. The wheel is ready to use.`,
        );
        if (prices.some((p) => p.status === 'error')) {
          setNotice(
            'The price provider paused. Loaded prices were saved; refresh again later to continue.',
          );
          break;
        }
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setNotice(
          e instanceof Error ? e.message : 'Prices could not be refreshed.',
        );
    } finally {
      pending.current = false;
      setPriceBusy(false);
    }
  }
  async function recordSnapshot(id: number) {
    await update((old) => {
      const inv = old.inventories[String(id)];
      if (!inv) return old;
      const snapshot = {
        at: new Date().toISOString(),
        owner: inv.steamId,
        appId: id,
        complete: inv.status === 'complete',
        holdings: inv.items.map((item) => ({
          id: item.id,
          key: item.marketHashName
            ? marketKey(id, item.marketHashName)
            : item.id,
          quantity: item.quantity,
          quote:
            item.marketable && item.marketHashName
              ? old.prices[marketKey(id, item.marketHashName)]?.quote || null
              : null,
        })),
      };
      return { ...old, snapshots: [...old.snapshots, snapshot].slice(-365) };
    });
  }
  async function marketPrices(items: Item[], signal: AbortSignal) {
    const variants = [
      ...new Map(
        items
          .filter((i) => i.marketable && i.marketHashName)
          .map((i) => [
            marketKey(i.appId, i.marketHashName!),
            { appId: i.appId, name: i.marketHashName! },
          ]),
      ).values(),
    ];
    for (let i = 0; i < variants.length; i += 8) {
      const { prices } = await api.market(variants.slice(i, i + 8), signal);
      await savePrices(prices);
      if (prices.some((p) => p.status === 'error')) {
        setNotice(
          'Inventory loaded. Some prices are unavailable; refresh prices later to continue.',
        );
        return;
      }
    }
  }
  async function fetchInventory(
    targetAppId: number,
    resume: boolean,
    signal: AbortSignal,
  ) {
    const steamId = current.current.library?.profile.steamId;
    if (!steamId) throw new Error('Load a Steam profile first.');
    let items = resume
      ? current.current.inventories[String(targetAppId)]?.items || []
      : [];
    let cursor = resume
      ? current.current.inventories[String(targetAppId)]?.cursor || undefined
      : undefined;
    const seen = new Set<string>();
    try {
      for (let page = 0; page < 100; page++) {
        const result = await api.inventory(
          steamId,
          targetAppId,
          cursor,
          signal,
        );
        if (
          result.cursor &&
          (result.cursor === cursor || seen.has(result.cursor))
        )
          throw new Error(
            'The inventory provider repeated a page. Loading is incomplete.',
          );
        items = [
          ...new Map(
            [...items, ...result.items].map((item) => [item.id, item]),
          ).values(),
        ];
        await update((old) => ({
          ...old,
          inventories: {
            ...old.inventories,
            [targetAppId]: { ...result, items },
          },
        }));
        if (!result.cursor) {
          try {
            await marketPrices(items, signal);
          } catch (error) {
            if (!signal.aborted)
              setNotice(
                error instanceof Error
                  ? error.message
                  : 'Inventory loaded. Prices are unavailable.',
              );
          }
          await recordSnapshot(targetAppId);
          return { appId: targetAppId, status: 'complete' as const, items };
        }
        seen.add(result.cursor);
        cursor = result.cursor;
        if (items.length >= 100000)
          throw new Error(
            'The device limit is 100,000 assets. This inventory remains incomplete.',
          );
      }
      throw new Error(
        '100 inventory pages were loaded. Continue loading to fetch the rest.',
      );
    } catch (error) {
      const privateState =
        error instanceof ClientError && error.code === 'inventory-private';
      const message = signal.aborted
        ? 'Loading stopped. Returned items were saved.'
        : error instanceof Error
          ? error.message
          : 'Inventory is unavailable.';
      const status = privateState
        ? ('private' as const)
        : items.length || cursor
          ? ('partial' as const)
          : ('unavailable' as const);
      await update((old) => ({
        ...old,
        inventories: {
          ...old.inventories,
          [targetAppId]: {
            steamId,
            appId: targetAppId,
            items,
            status,
            cursor: cursor || null,
            fetchedAt: new Date().toISOString(),
            message,
          },
        },
      }));
      if (signal.aborted) throw error;
      return { appId: targetAppId, status, items };
    }
  }
  async function loadInventory(resume: boolean) {
    if (
      !state.library?.profile.steamId ||
      pending.current ||
      state.mode === 'demo'
    )
      return;
    pending.current = true;
    setInventoryBusy(true);
    setNotice('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await fetchInventory(appId, resume, abort.signal);
      if (!abort.signal.aborted)
        setNotice(
          result.status === 'complete'
            ? `${result.items.length} distinct items loaded for this inventory.`
            : current.current.inventories[String(appId)]?.message ||
                'Inventory loading is incomplete.',
        );
    } catch (error) {
      if (!abort.signal.aborted)
        setNotice(
          error instanceof Error ? error.message : 'Inventory is unavailable.',
        );
    } finally {
      pending.current = false;
      setInventoryBusy(false);
    }
  }
  async function loadAllInventories() {
    if (
      !state.library?.profile.steamId ||
      pending.current ||
      state.mode === 'demo'
    )
      return;
    pending.current = true;
    setInventoryBusy(true);
    setNotice('Starting full inventory scan…');
    const abort = new AbortController();
    controller.current = abort;
    let complete = 0;
    let privateCount = 0;
    let unavailable = 0;
    try {
      for (let index = 0; index < INVENTORIES.length; index++) {
        const game = INVENTORIES[index]!;
        setAppId(game.appId);
        setNotice(
          `Scanning ${game.name} · ${index + 1} / ${INVENTORIES.length}`,
        );
        const result = await fetchInventory(game.appId, false, abort.signal);
        if (result.status === 'complete') complete++;
        else if (result.status === 'private') privateCount++;
        else unavailable++;
        if (abort.signal.aborted) break;
      }
      if (!abort.signal.aborted)
        setNotice(
          `Full scan finished: ${complete} complete, ${privateCount} private, ${unavailable} unavailable or partial.`,
        );
    } catch (error) {
      setNotice(
        abort.signal.aborted
          ? 'Full scan stopped. Everything returned so far was saved.'
          : error instanceof Error
            ? error.message
            : 'Full inventory scan stopped.',
      );
    } finally {
      pending.current = false;
      setInventoryBusy(false);
    }
  }
  async function refreshMarketPrices() {
    if (pending.current || state.mode === 'demo') return;
    pending.current = true;
    setInventoryBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await marketPrices(
        state.inventories[String(appId)]?.items || [],
        abort.signal,
      );
      await recordSnapshot(appId);
    } catch (error) {
      if (!abort.signal.aborted)
        setNotice(
          error instanceof Error ? error.message : 'Prices are unavailable.',
        );
    } finally {
      pending.current = false;
      setInventoryBusy(false);
    }
  }
  function removeGame(game: Game) {
    if (!window.confirm(`Remove ${game.name} from your custom games?`)) return;
    void update((old) => ({
      ...old,
      customGames: old.customGames.filter((g) => g.id !== game.id),
      favorites: old.favorites.filter((id) => id !== game.id),
      excluded: old.excluded.filter((id) => id !== game.id),
      used: old.used.filter((id) => id !== game.id),
    }));
  }
  if (!ready)
    return (
      <main className="boot">
        <Gamepad2 size={32} />
        <p>Opening your saved library…</p>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <button
          className="wordmark"
          aria-label="NEXT UP home"
          onClick={() => navigate('play')}
        >
          <span className="brand-icon">
            N<span>↗</span>
          </span>
          NEXT UP<span className="brand-period">.</span>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'play', name: 'Play', icon: Gamepad2 },
              { id: 'library', name: 'Library', icon: LibraryIcon },
              { id: 'inventory', name: 'Inventory', icon: Box },
            ] as const
          ).map((tab) => (
            <button
              disabled={wheelBusy}
              key={tab.id}
              aria-current={view === tab.id ? 'page' : undefined}
              className={view === tab.id ? 'active' : ''}
              onClick={() => navigate(tab.id)}
            >
              <tab.icon size={18} />
              {tab.name}
            </button>
          ))}
        </nav>
        <button
          className="icon-button settings-button"
          aria-label="Data and preferences"
          onClick={() => setDialog('settings')}
        >
          <Settings2 size={21} />
        </button>
      </header>
      <main id="main">
        <section className="profile-strip" aria-label="Steam profile">
          <div className="profile-label">
            <span className="eyebrow">YOUR STEAM PROFILE</span>
            <p>
              {state.library
                ? state.library.profile.name
                : 'Bring your backlog.'}
            </p>
          </div>
          <form onSubmit={(e) => void loadProfile(e)}>
            <label className="sr-only" htmlFor="profile-link">
              Steam profile link or SteamID64
            </label>
            <input
              id="profile-link"
              autoComplete="off"
              spellCheck={false}
              placeholder="steamcommunity.com/id/your-name"
              value={profileInput}
              onChange={(e) => setProfileInput(e.target.value)}
              disabled={
                loadingProfile || inventoryBusy || priceBusy || wheelBusy
              }
            />
            <button
              className="primary"
              disabled={
                loadingProfile || inventoryBusy || priceBusy || wheelBusy
              }
            >
              {loadingProfile ? 'Loading…' : 'Load games'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          {state.mode === 'live' && (
            <button
              className="text-button demo-trigger"
              disabled={
                inventoryBusy || priceBusy || wheelBusy || loadingProfile
              }
              onClick={() => {
                void update((old) => demoState(old));
                setNotice('');
              }}
            >
              Try demo <ChevronRight size={16} />
            </button>
          )}
        </section>
        {state.mode === 'demo' ? (
          <div className="demo-notice">
            <strong>DEMO</strong>
            <span>
              Sample library, playtime, and prices. These are not live
              valuations.
            </span>
            <button
              className="text-button"
              disabled={wheelBusy}
              onClick={() => {
                void update(leaveDemo);
                setNotice('');
              }}
            >
              Use my library
            </button>
          </div>
        ) : (
          !state.library && (
            <p className="profile-hint">
              Public game details are needed to load Steam games. No sign-in
              required.{' '}
              <button
                className="text-button"
                onClick={() => setDialog('custom')}
              >
                Or add a custom game
              </button>
            </p>
          )
        )}
        {storageError && (
          <div className="notice error" role="alert">
            {storageError}
            <button className="text-button" onClick={exportData}>
              Export backup
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() => setNotice('')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {view === 'play' && (
          <>
            <div className="play-heading">
              <div>
                <span className="eyebrow">
                  STOP SCROLLING. START SOMETHING.
                </span>
                <h1>Pick your next game.</h1>
              </div>
              <button
                className="secondary"
                disabled={wheelBusy}
                onClick={() => setDialog('custom')}
              >
                <Plus size={18} />
                Add a game
              </button>
            </div>
            <Wheel
              key={`${state.mode}:${state.library?.profile.steamId || 'custom'}:${JSON.stringify(state.filters)}:${state.excluded.join(',')}:${state.customGames.map((g) => g.id).join(',')}`}
              saved={!storageError}
              games={eligible}
              last={state.rolls[0]}
              instant={state.filters.instant}
              onBusy={setWheelBusy}
              onRoll={(roll) =>
                update((old) => ({
                  ...old,
                  rolls: [roll, ...old.rolls].slice(0, 1000),
                  used: [...new Set([...old.used, roll.game.id])],
                }))
              }
            />
            <section className="pool-panel">
              <div className="section-heading">
                <div>
                  <h2>
                    In the running{' '}
                    <span className="small muted">{eligible.length} games</span>
                  </h2>
                </div>
                <button
                  className="text-button"
                  disabled={wheelBusy}
                  onClick={() => navigate('library')}
                >
                  Manage games <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="pool-controls">
                <Toggle
                  label="Unplayed only"
                  checked={state.filters.unplayed}
                  disabled={wheelBusy}
                  onChange={(unplayed) =>
                    void update((old) => ({
                      ...old,
                      filters: { ...old.filters, unplayed },
                    }))
                  }
                />
                <Toggle
                  label="No repeats"
                  checked={state.filters.noRepeat}
                  disabled={wheelBusy}
                  onChange={(noRepeat) =>
                    void update((old) => ({
                      ...old,
                      filters: { ...old.filters, noRepeat },
                    }))
                  }
                />
                <details className="advanced-filters">
                  <summary>
                    <SlidersHorizontal size={16} />
                    More filters
                  </summary>
                  <div className="filter-popover">
                    <Toggle
                      label="Favorites only"
                      checked={state.filters.favoritesOnly}
                      disabled={wheelBusy}
                      onChange={(favoritesOnly) =>
                        void update((old) => ({
                          ...old,
                          filters: { ...old.filters, favoritesOnly },
                        }))
                      }
                    />
                    <Toggle
                      label="Instant result"
                      checked={state.filters.instant}
                      disabled={wheelBusy}
                      onChange={(instant) =>
                        void update((old) => ({
                          ...old,
                          filters: { ...old.filters, instant },
                        }))
                      }
                    />
                    <label>
                      Platform
                      <select
                        value={state.filters.platform}
                        disabled={wheelBusy}
                        onChange={(e) =>
                          void update((old) => ({
                            ...old,
                            filters: {
                              ...old.filters,
                              platform: e.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">All platforms</option>
                        {[...new Set(games.map((g) => g.platform))]
                          .sort()
                          .map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Tag
                      <select
                        value={state.filters.tag}
                        disabled={wheelBusy}
                        onChange={(e) =>
                          void update((old) => ({
                            ...old,
                            filters: { ...old.filters, tag: e.target.value },
                          }))
                        }
                      >
                        <option value="">All tags</option>
                        {[...new Set(games.flatMap((g) => g.tags))]
                          .sort()
                          .map((tag) => (
                            <option key={tag}>{tag}</option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      disabled={wheelBusy}
                      onClick={() =>
                        void update((old) => ({ ...old, used: [] }))
                      }
                    >
                      Reset no-repeat cycle ({state.used.length})
                    </button>
                  </div>
                </details>
              </div>
              {eligible.length ? (
                <div className="pool-grid">
                  {eligible.slice(0, 5).map((game) => (
                    <div className="pool-game" key={game.id}>
                      <Artwork src={game.image} name={game.name} />
                      <div>
                        <strong>{game.name}</strong>
                        <span>{hours(game.minutes)}</span>
                      </div>
                      <button
                        className={`icon-button ${state.favorites.includes(game.id) ? 'accent' : ''}`}
                        aria-label={`Favorite ${game.name}`}
                        aria-pressed={state.favorites.includes(game.id)}
                        onClick={() => toggleList('favorites', game.id)}
                      >
                        <Star
                          size={16}
                          fill={
                            state.favorites.includes(game.id)
                              ? 'currentColor'
                              : 'none'
                          }
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pool-empty">
                  <p>
                    {games.length
                      ? 'No games match these filters, or the no-repeat cycle is complete.'
                      : 'Paste your Steam profile above, add a custom game, or try the demo.'}
                  </p>
                  {games.length > 0 && (
                    <button
                      className="secondary"
                      disabled={wheelBusy}
                      onClick={() =>
                        void update((old) => ({
                          ...old,
                          used: [],
                          filters: {
                            ...emptyState().filters,
                            instant: old.filters.instant,
                          },
                        }))
                      }
                    >
                      Reset filters and cycle
                    </button>
                  )}
                </div>
              )}
              {eligible.length > 5 && (
                <button
                  className="text-button small"
                  onClick={() => navigate('library')}
                >
                  +{eligible.length - 5} more eligible games
                </button>
              )}
            </section>
            {state.rolls.length > 0 && (
              <section className="recent-panel">
                <h2>Recent picks</h2>
                <ol>
                  {state.rolls.slice(0, 6).map((roll) => (
                    <li key={roll.id}>
                      <span>{roll.game.name}</span>
                      <small>{dateLabel(roll.at)}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
        {view === 'library' && (
          <LibraryView
            state={state}
            games={games}
            onFavorite={(id) => toggleList('favorites', id)}
            onInclude={(id) => toggleList('excluded', id)}
            onAdd={() => setDialog('custom')}
            onRemove={removeGame}
            onPrices={() => void loadStorePrices()}
            priceBusy={priceBusy || inventoryBusy}
          />
        )}
        {view === 'inventory' && (
          <InventoryView
            state={state}
            appId={appId}
            setAppId={setAppId}
            onLoad={(resume) => void loadInventory(resume)}
            onLoadAll={() => void loadAllInventories()}
            onPrices={() => void refreshMarketPrices()}
            busy={inventoryBusy || priceBusy}
            onCancel={() => controller.current?.abort()}
          />
        )}
      </main>
      <footer>
        <span>
          <Check size={14} />
          {storageError ? 'Changes not saved' : 'Saved on this device'}
        </span>
        <div>
          <button className="text-button" onClick={() => setDialog('privacy')}>
            Privacy & data
          </button>
          <a
            href="https://store.steampowered.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Steam data
          </a>
          <span>EUR · FI</span>
        </div>
      </footer>
      {dialog === 'custom' && (
        <CustomGame
          onClose={() => setDialog(null)}
          onAdd={async (game) => {
            await update((old) => ({
              ...old,
              customGames: [...old.customGames, game],
            }));
            setDialog(null);
            setNotice(`${game.name} added.`);
          }}
        />
      )}
      {dialog === 'settings' && (
        <Modal title="Data and preferences" onClose={() => setDialog(null)}>
          <p>
            Your games, settings, picks, and personal inventory snapshots are
            saved on this device.
          </p>
          <div className="settings-actions">
            <button className="secondary" onClick={exportData}>
              <Download size={18} />
              Export JSON backup
            </button>
            <button
              className="secondary"
              disabled={pending.current}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={18} />
              Import JSON backup
            </button>
            <button
              className="secondary"
              disabled={pending.current || wheelBusy}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete all NEXT UP data on this device, including custom games and saved picks?',
                  )
                )
                  clear()
                    .then(() => {
                      setDialog(null);
                      setNotice('Local data cleared.');
                    })
                    .catch(() =>
                      setNotice('Could not clear local data. Please retry.'),
                    );
              }}
            >
              Clear local data
            </button>
          </div>
          <p className="hint">
            Import replaces saved data after confirmation. Keep an export if you
            switch devices or clear browser storage.
          </p>
          <div className="service-status">
            <h3>Live connections</h3>
            <p>Steam games: {health?.steam ? 'Configured' : 'Not connected'}</p>
            <p>
              Inventory provider:{' '}
              {health?.inventory ? 'Configured' : 'Not connected'}
            </p>
            <p>
              Finnish store prices:{' '}
              {health?.store ? 'Enabled' : 'Not connected'}
            </p>
          </div>
        </Modal>
      )}
      {dialog === 'privacy' && (
        <Privacy health={health} onClose={() => setDialog(null)} />
      )}
      <input
        className="sr-only"
        tabIndex={-1}
        ref={importInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import NEXT UP backup"
        onChange={(e) => void importData(e.target.files?.[0])}
      />
    </div>
  );
}

function CustomGame({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (game: Game) => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = gameSchema.safeParse({
      id: `custom:${uniqueId()}`,
      kind: 'custom',
      name: form.get('name'),
      platform: form.get('platform'),
      image: form.get('image'),
      tags: [
        ...new Set(
          String(form.get('tags') || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      minutes: 0,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Check the game details.');
      return;
    }
    setSaving(true);
    await onAdd(result.data);
    setSaving(false);
  }
  return (
    <Modal title="Add a custom game" onClose={onClose}>
      <form className="custom-form" onSubmit={(e) => void submit(e)}>
        <label>
          Game name
          <input name="name" placeholder="Minecraft" required maxLength={160} />
        </label>
        <label>
          Platform or launcher
          <input
            name="platform"
            placeholder="Minecraft Launcher, Riot, Epic…"
            required
            maxLength={50}
          />
        </label>
        <label>
          Artwork URL <span className="muted">optional</span>
          <input
            name="image"
            type="url"
            placeholder="https://…"
            maxLength={2048}
          />
        </label>
        <label>
          Tags <span className="muted">optional, comma-separated</span>
          <input
            name="tags"
            placeholder="Co-op, relaxed, survival"
            maxLength={400}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={saving}>
          <Plus size={18} />
          {saving ? 'Saving…' : 'Add to my games'}
        </button>
      </form>
    </Modal>
  );
}
function Privacy({
  health,
  onClose,
}: {
  health: Health | null;
  onClose: () => void;
}) {
  return (
    <Modal title="Privacy & data" onClose={onClose}>
      <div className="privacy-copy">
        <h3>On your device</h3>
        <p>
          NEXT UP stores custom games, Steam results you load, filters,
          favorites, selected games, price caches, and up to 365 personal
          inventory snapshots in IndexedDB. They stay until you use Clear local
          data or your browser removes them. Up to 1,000 recent picks are
          retained. JSON export and import are available in Data and
          preferences.
        </p>
        <h3>When you load Steam data</h3>
        <p>
          Your profile identifier is sent to this site’s Cloudflare Worker.
          Steam receives profile and game-library requests; SteamWebAPI receives
          inventory lookups. Their services process those requests under their
          own privacy policies. Images are loaded from Steam’s image servers or
          a custom image host you choose. These hosts receive your IP address.
        </p>
        <h3>Shared data and retention</h3>
        <p>
          D1 stores public item and store prices for up to 400 days and item
          tracking for 7 days after the last request. No Steam IDs or personal
          inventories are written to D1. Temporary, salted IP hashes limit abuse
          and are removed within two hours. The application does not log profile
          requests. Hosting and API providers may keep operational records under
          their own policies.
        </p>
        <h3>Purpose and legal basis</h3>
        <p>
          Data is processed to provide the lookup and local saving you request
          (GDPR Article 6(1)(b)). Necessary abuse prevention uses legitimate
          interests (Article 6(1)(f)). No analytics, advertising trackers,
          account registration, or optional tracking cookies are used.
        </p>
        <h3>Operator and location</h3>
        <p>
          {health?.privacy.controller
            ? `Controller: ${health.privacy.controller}.`
            : 'Live operator details have not been configured.'}{' '}
          {health?.privacy.contact &&
            `Privacy contact: ${health.privacy.contact}.`}{' '}
          {health?.privacy.countries
            ? `Operator-configured processing/storage countries: ${health.privacy.countries}.`
            : 'The operator must identify processing and storage countries before enabling live services.'}
        </p>
        <p>
          GitHub Pages, Cloudflare, Valve, and SteamWebAPI infrastructure may
          process requests internationally. Operator deployment settings and
          provider agreements determine locations and safeguards.
        </p>
        <h3>Your choices</h3>
        <p>
          Use custom games without sending a Steam profile. Export or delete
          device data in Data and preferences. Contact the operator for access,
          correction, deletion, restriction, portability, or objections to
          server-side processing. You may complain to your local data protection
          authority.
        </p>
        <p>
          <a
            href="https://store.steampowered.com/privacy_agreement/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Valve privacy
          </a>{' '}
          ·{' '}
          <a
            href="https://www.steamwebapi.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            SteamWebAPI privacy
          </a>{' '}
          ·{' '}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cloudflare privacy
          </a>{' '}
          ·{' '}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub privacy
          </a>
        </p>
        <h3>About these estimates</h3>
        <p>
          NEXT UP is independent of Valve and Steam. Steam data is supplied as
          available, without warranties of availability or accuracy. Library
          figures estimate current replacement cost. Item figures estimate Steam
          Wallet market listings in EUR; wallet funds cannot be withdrawn.
          Missing prices stay unknown, and observations start when data is
          actually received.
        </p>
      </div>
    </Modal>
  );
}
