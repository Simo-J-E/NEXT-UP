import { money, sumPrices } from '../../shared/core';
import { marketKey, storeKey, type State } from '../../shared/model';

const number = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 });

function jokeForGrass(totalHours: number) {
  const squareMeters = Math.max(1, Math.round(totalHours / 25));
  if (totalHours < 100)
    return {
      squareMeters,
      text: 'You still remember what sunlight looks like.',
    };
  if (totalHours < 500)
    return {
      squareMeters,
      text: 'A short park visit should cover the damage.',
    };
  if (totalHours < 1500)
    return { squareMeters, text: 'Your mouse hand should meet a tree.' };
  if (totalHours < 3000)
    return { squareMeters, text: 'A lawn is now part of the recovery plan.' };
  if (totalHours < 6000)
    return {
      squareMeters,
      text: 'Weekend camping has been strongly suggested.',
    };
  if (totalHours < 10000)
    return { squareMeters, text: 'At this point, consider adopting a field.' };
  return {
    squareMeters,
    text: 'Your desk may now qualify as a permanent biome.',
  };
}

function moneyJoke(valueMinor: number | null) {
  if (valueMinor === null)
    return {
      days: 0,
      advisors: 0,
      text: 'Load prices before the wallet can be judged.',
    };
  const euros = valueMinor / 100;
  const days = Math.max(1, Math.ceil(euros / 50));
  const advisors = euros < 500 ? 0 : Math.ceil(euros / 1000);
  if (euros < 100)
    return { days, advisors, text: 'Wallet status: mostly unharmed.' };
  if (euros < 500)
    return {
      days,
      advisors,
      text: 'That is several dangerously convincing Steam sales.',
    };
  if (euros < 1500)
    return {
      days,
      advisors,
      text: 'You could have built a respectable PC-shaped regret.',
    };
  if (euros < 5000)
    return {
      days,
      advisors,
      text: 'Do not open this page next to your banking app.',
    };
  return {
    days,
    advisors,
    text: 'The collection may now require its own financial department.',
  };
}

export function AccountOverview({ state }: { state: State }) {
  const games = state.library?.games || [];
  if (!games.length) return null;

  const steamGames = games.filter((game) => game.appId);
  const knownPlaytime = steamGames.filter((game) => game.minutes !== null);
  // SteamDB treats under five minutes as unplayed for its pile-of-shame figure.
  const played = knownPlaytime.filter((game) => (game.minutes || 0) >= 5);
  const pile = knownPlaytime.length - played.length;
  const totalMinutes = knownPlaytime.reduce(
    (total, game) => total + (game.minutes || 0),
    0,
  );
  const totalHours = totalMinutes / 60;
  const averagePlaytime = played.length ? totalHours / played.length : 0;
  const playedPercent = knownPlaytime.length
    ? Math.round((played.length / knownPlaytime.length) * 100)
    : 0;

  const libraryValue = sumPrices(
    steamGames.map((game) => ({
      price: state.prices[storeKey(game.appId!)],
      quantity: 1,
    })),
  );
  const inventoryRows = Object.values(state.inventories).flatMap((inventory) =>
    inventory.items.map((item) => ({
      price:
        item.marketable && item.marketHashName
          ? state.prices[marketKey(item.appId, item.marketHashName)]
          : undefined,
      quantity: item.quantity,
    })),
  );
  const inventoryValue = sumPrices(inventoryRows);
  const trackedValue =
    libraryValue.total === null && inventoryValue.total === null
      ? null
      : (libraryValue.total || 0) + (inventoryValue.total || 0);
  const averagePrice = libraryValue.priced
    ? (libraryValue.total || 0) / libraryValue.priced
    : null;
  const pricePerHour =
    totalHours > 0 && libraryValue.total !== null
      ? libraryValue.total / totalHours
      : null;
  const mostPlayed = [...knownPlaytime].sort(
    (a, b) => (b.minutes || 0) - (a.minutes || 0),
  )[0];
  const grass = jokeForGrass(totalHours);
  const wallet = moneyJoke(trackedValue);
  const accountAgeYears = state.library?.profile.createdAt
    ? (Date.now() - Date.parse(state.library.profile.createdAt)) /
      (365.2425 * 24 * 3600 * 1000)
    : null;

  return (
    <section
      className="account-overview"
      aria-labelledby="account-overview-title"
    >
      <div className="account-overview-heading">
        <div>
          <span className="eyebrow">ACCOUNT AUTOPSY</span>
          <h2 id="account-overview-title">
            The numbers Steam normally lets you avoid
          </h2>
        </div>
        <span className="account-overview-note">
          {state.library?.profile.level !== undefined
            ? `Steam level ${state.library.profile.level} · `
            : ''}
          {accountAgeYears !== null
            ? `${number.format(accountAgeYears)} years old · `
            : ''}
          current estimates, not actual money spent
        </span>
      </div>

      <div className="calculator-grid">
        <div>
          <span>Tracked account value</span>
          <strong>{money(trackedValue)}</strong>
          <small>Library + loaded inventory estimates</small>
        </div>
        <div>
          <span>Hours on record</span>
          <strong>{number.format(totalHours)} h</strong>
          <small>{knownPlaytime.length} games with visible playtime</small>
        </div>
        <div>
          <span>Games actually played</span>
          <strong>{playedPercent}%</strong>
          <small>
            {played.length} / {knownPlaytime.length} · avg{' '}
            {number.format(averagePlaytime)} h
          </small>
        </div>
        <div>
          <span>Pile of shame</span>
          <strong>{pile}</strong>
          <small>Owned games with under 5 minutes</small>
        </div>
        <div>
          <span>Library value</span>
          <strong>{money(libraryValue.total)}</strong>
          <small>
            {libraryValue.priced} / {steamGames.length} games priced
          </small>
        </div>
        <div>
          <span>Loaded inventories</span>
          <strong>{money(inventoryValue.total)}</strong>
          <small>{inventoryValue.priced} priced items</small>
        </div>
        <div>
          <span>Games owned</span>
          <strong>{steamGames.length}</strong>
          <small>
            {libraryValue.priced} priced · avg {money(averagePrice)}
          </small>
        </div>
        <div>
          <span>Current price / hour</span>
          <strong>{money(pricePerHour)}</strong>
          <small>Library estimate divided by recorded playtime</small>
        </div>
      </div>

      <div className="roast-grid">
        <article>
          <span className="roast-label">GRASS REQUIRED</span>
          <strong>{grass.squareMeters} m²</strong>
          <p>{grass.text}</p>
        </article>
        <article>
          <span className="roast-label">WALLET COOLDOWN</span>
          <strong>{wallet.days || '—'} days</strong>
          <p>{wallet.text}</p>
        </article>
        <article>
          <span className="roast-label">FINANCIAL ADVISERS REQUIRED</span>
          <strong>{wallet.advisors}</strong>
          <p>
            {wallet.advisors
              ? 'One for roughly every €1,000 of tracked digital evidence.'
              : 'Your finances are not asking for backup yet.'}
          </p>
        </article>
      </div>

      {mostPlayed && (
        <p className="account-punchline">
          Biggest time sink: <strong>{mostPlayed.name}</strong> at{' '}
          {number.format((mostPlayed.minutes || 0) / 60)} hours. It knows what
          it did.
        </p>
      )}
    </section>
  );
}
