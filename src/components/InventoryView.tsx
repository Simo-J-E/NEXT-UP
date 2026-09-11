import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Box, RefreshCw, Search } from 'lucide-react';
import {
  dateLabel,
  isStale,
  money,
  priceChange,
  snapshotChange,
  sumPrices,
} from '../../shared/core';
import {
  INVENTORIES,
  marketKey,
  marketLink,
  type Item,
  type Quote,
  type State,
} from '../../shared/model';
import { api } from '../api';
import { Artwork, Empty, Modal } from './Primitives';
import { Bars, HistoryChart } from './Charts';

export function InventoryView({
  state,
  appId,
  setAppId,
  onLoad,
  onLoadAll,
  onPrices,
  busy,
  onCancel,
}: {
  state: State;
  appId: number;
  setAppId: (id: number) => void;
  onLoad: (resume: boolean) => void;
  onLoadAll: () => void;
  onPrices: () => void;
  busy: boolean;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState('value'),
    [selected, setSelected] = useState<Item | null>(null),
    [page, setPage] = useState(1);
  const inventory = state.inventories[String(appId)],
    items = inventory?.items || [];
  const definition = INVENTORIES.find((g) => g.appId === appId)!;
  const itemPrice = (item: Item) =>
    item.marketable && item.marketHashName
      ? state.prices[marketKey(item.appId, item.marketHashName)]
      : undefined;
  const total = sumPrices(
    items.map((item) => ({ price: itemPrice(item), quantity: item.quantity })),
  );
  const loadedInventories = INVENTORIES.flatMap((game) => {
    const loaded = state.inventories[String(game.appId)];
    return loaded ? [loaded] : [];
  });
  const allItems = loadedInventories.flatMap((loaded) => loaded.items);
  const allTotal = sumPrices(
    allItems.map((item) => ({
      price: itemPrice(item),
      quantity: item.quantity,
    })),
  );
  const completeInventories = loadedInventories.filter(
    (loaded) => loaded.status === 'complete',
  ).length;
  const visible = items
    .filter((item) =>
      `${item.name} ${item.category} ${item.condition || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (itemPrice(b)?.quote?.minor ?? -1) * b.quantity -
          (itemPrice(a)?.quote?.minor ?? -1) * a.quantity,
    );
  const snapshots = state.snapshots.filter(
    (s) =>
      s.appId === appId &&
      s.owner ===
        (state.mode === 'demo' ? 'demo' : state.library?.profile.steamId),
  );
  const change =
    snapshots.length >= 2
      ? snapshotChange(snapshots.at(-2)!, snapshots.at(-1)!)
      : null;
  const categoryMap = new Map<string, number>();
  items.forEach((item) => {
    const price = itemPrice(item)?.quote;
    if (price)
      categoryMap.set(
        item.category,
        (categoryMap.get(item.category) || 0) + price.minor * item.quantity,
      );
  });
  const byGame = INVENTORIES.flatMap((g) => {
    const inv = state.inventories[String(g.appId)];
    if (!inv) return [];
    const value = sumPrices(
      inv.items.map((item) => ({
        price: itemPrice(item),
        quantity: item.quantity,
      })),
    ).total;
    return value === null
      ? []
      : [
          {
            name: `${g.short}${inv.status !== 'complete' ? ' (partial)' : ''}`,
            value,
          },
        ];
  });
  const movers = useMemo(() => {
    const quotes = new Map<string, Quote[]>();
    for (const snapshot of snapshots)
      for (const item of snapshot.holdings)
        if (item.quote) {
          const list = quotes.get(item.key) || [];
          if (!list.some((q) => q.observedAt === item.quote!.observedAt))
            list.push(item.quote);
          quotes.set(item.key, list);
        }
    return [...quotes].flatMap(([key, values]) => {
      const difference = priceChange(values);
      return difference ? [{ key, ...difference }] : [];
    });
  }, [snapshots]);
  return (
    <>
      <div className="view-heading">
        <div>
          <span className="eyebrow">THE ITEM DRAWER</span>
          <h1>Your inventory</h1>
        </div>
        <div className="inventory-actions">
          <button
            className="primary"
            disabled={busy || state.mode === 'demo' || !state.library}
            onClick={onLoadAll}
          >
            <Box size={17} />
            Scan everything
          </button>
          <button
            className="secondary"
            disabled={busy || state.mode === 'demo' || !state.library}
            onClick={() => onLoad(false)}
          >
            <RefreshCw size={17} />
            Refresh selected
          </button>
        </div>
      </div>
      <div className="all-inventory-summary">
        <div>
          <span className="eyebrow">ALL LOADED INVENTORIES</span>
          <strong>{money(allTotal.total)}</strong>
          <small>
            {allItems.reduce((n, item) => n + item.quantity, 0)} items ·{' '}
            {completeInventories} / {INVENTORIES.length} inventories complete
          </small>
        </div>
        <p>
          Scan everything checks every supported Steam inventory, keeps every
          returned item, and combines the priced total here. Private inventories
          stay marked private instead of stopping the rest of the scan.
        </p>
      </div>
      <div className="inventory-tabs" role="group" aria-label="Inventory game">
        {INVENTORIES.map((game) => (
          <button
            disabled={busy}
            key={game.appId}
            className={appId === game.appId ? 'selected' : ''}
            aria-pressed={appId === game.appId}
            onClick={() => {
              setAppId(game.appId);
              setPage(1);
              setSearch('');
            }}
          >
            {game.short}
          </button>
        ))}
      </div>
      <div className="stats-grid">
        <div>
          <span>
            Steam Wallet market estimate
            {inventory?.status === 'partial' ? ' · partial' : ''}
          </span>
          <strong>{money(total.total)}</strong>
          <small>
            {definition.name} · {total.priced} items priced
          </small>
        </div>
        <div>
          <span>Items returned</span>
          <strong>{items.reduce((n, item) => n + item.quantity, 0)}</strong>
          <small>
            {items.length} distinct assets · {inventory?.status || 'Not loaded'}
          </small>
        </div>
        <div>
          <span>Without a price</span>
          <strong>{total.unknown}</strong>
          <small>Included in the list, excluded from the estimate</small>
        </div>
      </div>
      <p className="price-explanation">
        Steam Market listing estimates use Steam Wallet funds, which cannot be
        withdrawn. These are not cash-out values or proceeds after fees.
        Premiums for float, pattern, or stickers are not estimated.
      </p>
      {inventory?.message && <p className="notice">{inventory.message}</p>}
      {busy && (
        <div className="notice" role="status">
          Loading… {items.length} assets received.{' '}
          <button className="text-button" onClick={onCancel}>
            Stop loading
          </button>
        </div>
      )}
      {inventory?.status === 'partial' && !busy && (
        <div className="notice">
          Loading is incomplete. Totals only cover returned items.{' '}
          <button
            className="text-button"
            onClick={() => onLoad(Boolean(inventory.cursor))}
          >
            {inventory.cursor ? 'Continue loading' : 'Retry inventory'}
          </button>
        </div>
      )}
      <div className="toolbar">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search inventory"
            placeholder="Search items, condition, category…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Sort inventory"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="value">Highest value</option>
          <option value="name">Name A–Z</option>
        </select>
        <button
          className="text-button"
          disabled={busy || !items.length || state.mode === 'demo'}
          onClick={onPrices}
        >
          Refresh prices
        </button>
      </div>
      {items.length ? (
        <>
          <div className="table-scroll inventory-table">
            <table>
              <caption className="sr-only">
                {definition.name} inventory, prices in EUR
              </caption>
              <thead>
                <tr>
                  <th>Item / condition</th>
                  <th>Quantity</th>
                  <th>Unit estimate</th>
                  <th>Total estimate</th>
                  <th>Market status</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, page * 40).map((item) => {
                  const price = itemPrice(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="item-button"
                          onClick={() => setSelected(item)}
                        >
                          <Artwork src={item.image} name={item.name} />
                          <span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.category}
                              {item.rarity ? ` · ${item.rarity}` : ''}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{money(price?.quote?.minor)}</td>
                      <td className="value-cell">
                        {money(
                          price?.quote
                            ? price.quote.minor * item.quantity
                            : null,
                        )}
                      </td>
                      <td>
                        <span className="small muted">
                          {!item.marketable
                            ? 'Not marketable'
                            : price?.quote && isStale(price.quote)
                              ? 'Stale price'
                              : price?.quote
                                ? 'Priced'
                                : 'Unpriced'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <p className="hint">No matching items.</p>}
          {visible.length > page * 40 && (
            <button
              className="secondary load-more"
              onClick={() => setPage((n) => n + 1)}
            >
              Show more items
            </button>
          )}
        </>
      ) : (
        <Empty
          title={
            inventory?.status === 'complete'
              ? 'This inventory is empty'
              : inventory?.status === 'private'
                ? 'This inventory is private'
                : 'Load an inventory'
          }
        >
          <p>
            {inventory?.status === 'private'
              ? 'Your profile, game details, and inventory have separate Steam privacy settings.'
              : `Load ${definition.name} items from the profile above.`}
          </p>
          <button
            className="secondary"
            disabled={busy || !state.library || state.mode === 'demo'}
            onClick={() => onLoad(false)}
          >
            <Box size={17} />
            Load {definition.short}
          </button>
        </Empty>
      )}
      {inventory && (
        <p className="small muted">
          Fetched {dateLabel(inventory.fetchedAt)} · Personal snapshots stay on
          this device
        </p>
      )}
      <p className="small muted">
        History totals include priced items only. Pricing coverage can change
        between snapshots; unpriced items are counted separately above.
      </p>
      <div className="analytics-grid">
        <HistoryChart
          title="Priced inventory subtotal over time"
          points={snapshots.map((s) => ({
            at: s.at,
            minor: s.complete
              ? sumPrices(
                  s.holdings.map((h) => ({
                    price: h.quote
                      ? {
                          key: h.key,
                          quote: h.quote,
                          status: 'priced' as const,
                        }
                      : undefined,
                    quantity: h.quantity,
                  })),
                ).total
              : null,
          }))}
        />
        <Bars
          title="Value by item category"
          rows={[...categoryMap]
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)}
        />
      </div>
      <div className="analytics-grid">
        <Bars title="Value by game · loaded inventories" rows={byGame} />
        <section className="chart-block">
          <h3>What changed?</h3>
          {change ? (
            <>
              <p className="small muted">
                {dateLabel(change.from)} → {dateLabel(change.to)}
              </p>
              <dl className="data-list">
                <div>
                  <dt>Price changes on shared quantity</dt>
                  <dd>{money(change.priceEffect)}</dd>
                </div>
                <div>
                  <dt>Added / removed quantities</dt>
                  <dd>{money(change.compositionEffect)}</dd>
                </div>
                <div>
                  <dt>Unpriced or incomparable variants</dt>
                  <dd>{change.unresolved}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="chart-empty">
              Load a complete inventory on two occasions to separate item-price
              changes from added or removed items.
            </p>
          )}
          <p className="small muted">
            Changes in estimated value are not profit. Acquisition costs are
            unknown.
          </p>
        </section>
      </div>
      <section className="chart-block">
        <h3>Biggest item-price moves</h3>
        {movers.length ? (
          <ul className="movers">
            {[...movers]
              .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor))
              .slice(0, 8)
              .map((move) => (
                <li key={move.key}>
                  <span>
                    {move.key.replace(/^market:\d+:/, '')}
                    <small>
                      {dateLabel(move.from)} → {dateLabel(move.to)}
                    </small>
                  </span>
                  <strong>
                    {move.minor > 0 ? '+' : ''}
                    {money(move.minor)}
                  </strong>
                </li>
              ))}
          </ul>
        ) : (
          <p className="chart-empty">
            Comparable price observations will appear here after future
            refreshes.
          </p>
        )}
      </section>
      {selected && (
        <ItemDetail
          item={selected}
          state={state}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function ItemDetail({
  item,
  state,
  onClose,
}: {
  item: Item;
  state: State;
  onClose: () => void;
}) {
  const key = item.marketHashName
    ? marketKey(item.appId, item.marketHashName)
    : '';
  const quote = state.prices[key]?.quote;
  const [observations, setObservations] = useState<Quote[]>(
      quote ? [quote] : [],
    ),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if (key && state.mode !== 'demo')
      api
        .history(key)
        .then((h) => {
          if (active) setObservations(h.observations);
        })
        .catch(() => {
          if (active)
            setMessage(
              'Shared price history is unavailable. The current observation is shown.',
            );
        });
    return () => {
      active = false;
    };
  }, [key, state.mode]);
  const link = marketLink(item),
    change = priceChange(observations);
  return (
    <Modal title={item.name} onClose={onClose}>
      <Artwork src={item.image} name={item.name} className="item-detail-art" />
      <dl className="data-list">
        <div>
          <dt>Asset ID</dt>
          <dd>{item.assetId}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{item.quantity}</dd>
        </div>
        <div>
          <dt>Unit estimate</dt>
          <dd>{money(quote?.minor)}</dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd>{item.condition || 'Not provided'}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {quote?.source === 'demo'
              ? 'Demo sample'
              : quote
                ? 'Steam Market via SteamWebAPI'
                : 'No price source'}
          </dd>
        </div>
        <div>
          <dt>Price basis</dt>
          <dd>Lowest listing · EUR conversion · Steam Wallet</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{quote ? dateLabel(quote.observedAt) : 'Not observed'}</dd>
        </div>
        <div>
          <dt>Provider updated</dt>
          <dd>
            {quote?.providerUpdatedAt
              ? dateLabel(quote.providerUpdatedAt)
              : 'Not supplied by provider'}
          </dd>
        </div>
      </dl>
      {state.prices[key]?.note && (
        <p className="notice">{state.prices[key]?.note}</p>
      )}
      {message && <p className="notice">{message}</p>}
      <HistoryChart
        title="Unit price over time"
        points={observations.map((q) => ({ at: q.observedAt, minor: q.minor }))}
      />
      {change && (
        <p>
          {money(change.minor)} change between {dateLabel(change.from)} and{' '}
          {dateLabel(change.to)}.
        </p>
      )}
      {link && (
        <a
          className="secondary"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Steam Market <ArrowUpRight size={17} />
        </a>
      )}
      <p className="hint">
        Artwork and item names belong to their respective owners. Market
        estimates do not include special premiums.
      </p>
    </Modal>
  );
}
