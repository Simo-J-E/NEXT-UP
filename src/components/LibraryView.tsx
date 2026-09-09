import { useState } from 'react';
import { ArrowDownUp, Plus, Search, Star, Trash2 } from 'lucide-react';
import { hours, isStale, money, sumPrices } from '../../shared/core';
import { storeKey, type Game, type State } from '../../shared/model';
import { Artwork, Empty } from './Primitives';
import { Bars } from './Charts';

export function LibraryView({
  state,
  games,
  onFavorite,
  onInclude,
  onAdd,
  onRemove,
  onPrices,
  priceBusy,
}: {
  state: State;
  games: Game[];
  onFavorite: (id: string) => void;
  onInclude: (id: string) => void;
  onAdd: () => void;
  onRemove: (game: Game) => void;
  onPrices: () => void;
  priceBusy: boolean;
}) {
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const visible = games
    .filter((g) =>
      `${g.name} ${g.platform} ${g.tags.join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'played'
        ? (b.minutes ?? -1) - (a.minutes ?? -1)
        : sort === 'unplayed'
          ? (a.minutes ?? Infinity) - (b.minutes ?? Infinity)
          : a.name.localeCompare(b.name),
    );
  const steam = games.filter((g) => g.appId);
  const rows = steam.map((g) => ({
    price: state.prices[storeKey(g.appId!)],
    quantity: 1,
  }));
  const current = sumPrices(rows),
    regular = sumPrices(rows, true);
  const unplayed = steam.filter((g) => g.minutes === 0).length,
    hidden = steam.filter((g) => g.minutes === null).length;
  return (
    <>
      <div className="view-heading">
        <div>
          <span className="eyebrow">THE COLLECTION</span>
          <h1>
            Your library<span className="heading-count">{games.length}</span>
          </h1>
        </div>
        <button className="secondary" onClick={onAdd}>
          <Plus size={18} />
          Add a game
        </button>
      </div>
      <div className="stats-grid">
        <div>
          <span>Current replacement estimate</span>
          <strong>{money(current.total)}</strong>
          <small>
            {current.priced} of {steam.length} games priced · EUR / Finland
          </small>
        </div>
        <div>
          <span>Regular-price estimate</span>
          <strong>{money(regular.total)}</strong>
          <small>{regular.priced} games with a regular price</small>
        </div>
        <div>
          <span>Still waiting to be played</span>
          <strong>
            {unplayed}
            <em> / {steam.length}</em>
          </strong>
          <small>
            {hidden
              ? `${hidden} games have hidden playtime`
              : 'Games with zero recorded playtime'}
          </small>
        </div>
      </div>
      <div className="price-explanation">
        <p>
          Current store prices estimate what these returned games cost to
          replace. They do not reveal what you paid, account resale value, DLC
          ownership, or purchased editions.
        </p>
        <button
          className="text-button"
          onClick={onPrices}
          disabled={priceBusy || !steam.length || state.mode === 'demo'}
        >
          {priceBusy ? 'Loading prices…' : 'Refresh store prices'}
        </button>
      </div>
      {state.library?.status !== 'public' && state.library && (
        <p className="notice">{state.library.message}</p>
      )}
      <div className="toolbar">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search your games"
            placeholder="Search games, platforms, tags…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="sort-control">
          <ArrowDownUp size={16} aria-hidden="true" />
          <select
            aria-label="Sort games"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="name">Name A–Z</option>
            <option value="played">Most played</option>
            <option value="unplayed">Least played</option>
          </select>
        </label>
      </div>
      {visible.length ? (
        <div className="game-grid">
          {visible.slice(0, page * 36).map((game) => {
            const price = game.appId
              ? state.prices[storeKey(game.appId)]
              : null;
            return (
              <article
                className={`game-card ${state.excluded.includes(game.id) ? 'excluded' : ''}`}
                key={game.id}
              >
                <div className="game-cover">
                  <Artwork src={game.image} name={game.name} />
                  <button
                    className={`favorite icon-button ${state.favorites.includes(game.id) ? 'active' : ''}`}
                    aria-label={`Favorite ${game.name}`}
                    aria-pressed={state.favorites.includes(game.id)}
                    onClick={() => onFavorite(game.id)}
                  >
                    <Star
                      size={18}
                      fill={
                        state.favorites.includes(game.id)
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>
                  <span className="cover-platform">{game.platform}</span>
                </div>
                <div className="game-body">
                  <h2>{game.name}</h2>
                  <p>{hours(game.minutes)}</p>
                  <div className="game-card-bottom">
                    <label className="include">
                      <input
                        type="checkbox"
                        checked={!state.excluded.includes(game.id)}
                        onChange={() => onInclude(game.id)}
                      />
                      <span>
                        In wheel<span className="sr-only">: {game.name}</span>
                      </span>
                    </label>
                    <span className="game-price">
                      {!game.appId
                        ? 'Custom'
                        : price?.status === 'free'
                          ? 'Free'
                          : money(price?.quote?.minor)}
                      {price?.quote && isStale(price.quote) && (
                        <small> Stale</small>
                      )}
                    </span>
                  </div>
                  {game.kind === 'custom' && (
                    <button
                      className="text-button small"
                      aria-label={`Remove ${game.name}`}
                      onClick={() => onRemove(game)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            games.length ? 'No matching games' : 'Your collection starts here'
          }
        >
          <p>
            {games.length
              ? 'Try another search.'
              : 'Load your Steam profile or add a custom game.'}
          </p>
        </Empty>
      )}
      {visible.length > page * 36 && (
        <button
          className="secondary load-more"
          onClick={() => setPage((n) => n + 1)}
        >
          Show more · {visible.length - page * 36} remaining
        </button>
      )}
      {steam.length > 0 && (
        <div className="analytics-grid">
          <Bars
            title="Most played"
            unit="hours"
            rows={steam
              .filter((g) => g.minutes !== null && g.minutes > 0)
              .sort((a, b) => b.minutes! - a.minutes!)
              .slice(0, 6)
              .map((g) => ({ name: g.name, value: g.minutes! }))}
          />
          <section className="chart-block">
            <h3>The unplayed shelf</h3>
            <div className="unplayed-stat">
              {steam.length - hidden
                ? `${Math.round((unplayed / (steam.length - hidden)) * 100)}%`
                : 'Unknown'}
            </div>
            <p className="muted">
              {unplayed} of {steam.length - hidden} games with visible playtime
              have never been played. Hidden playtime is excluded.
            </p>
            <p className="small muted">
              Try the “Unplayed only” filter on the Play view.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
