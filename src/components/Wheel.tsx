import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCw, Shuffle } from 'lucide-react';
import {
  landingRotation,
  randomIndex,
  wheelPreview,
  hours,
  uniqueId,
} from '../../shared/core';
import type { Game, Roll } from '../../shared/model';
import { Artwork } from './Primitives';

const palette = [
  '#343936',
  '#d56a48',
  '#454b42',
  '#6d6b50',
  '#3e4b4f',
  '#545046',
  '#54403a',
  '#556354',
  '#434a42',
  '#675945',
  '#374346',
  '#62604d',
];
function polar(degrees: number, radius: number) {
  const a = ((degrees - 90) * Math.PI) / 180;
  return [200 + radius * Math.cos(a), 200 + radius * Math.sin(a)];
}
function slice(index: number, total: number) {
  const [x, y] = polar((index * 360) / total, 185),
    [a, b] = polar(((index + 1) * 360) / total, 185);
  return `M200 200 L${x} ${y} A185 185 0 ${360 / total > 180 ? 1 : 0} 1 ${a} ${b} Z`;
}
export function Wheel({
  games,
  last,
  instant,
  onRoll,
  onBusy,
  saved,
}: {
  games: Game[];
  last?: Roll;
  instant: boolean;
  onRoll: (roll: Roll) => Promise<boolean>;
  onBusy: (busy: boolean) => void;
  saved: boolean;
}) {
  const [spinning, setSpinning] = useState(false),
    busy = useRef(false);
  const [rotation, setRotation] = useState(0),
    [frozen, setFrozen] = useState<Game[] | null>(null);
  const [announcement, setAnnouncement] = useState(''),
    [shown, setShown] = useState(last);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!busy.current) setShown(last);
  }, [last]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const displayed = frozen || wheelPreview(games);
  const finish = (roll: Roll) => {
    setSpinning(false);
    busy.current = false;
    setShown(roll);
    setAnnouncement(
      `Next up: ${roll.game.name}. Chosen from ${roll.poolSize} eligible games.`,
    );
    onBusy(false);
  };
  async function spin() {
    if (busy.current || !games.length) return;
    busy.current = true;
    onBusy(true);
    setSpinning(true);
    setAnnouncement('Choosing your next game.');
    const game = games[randomIndex(games.length)]!;
    const preview = wheelPreview(games, game);
    const result: Roll = {
      id: uniqueId(),
      game,
      at: new Date().toISOString(),
      poolSize: games.length,
    };
    setFrozen(preview);
    await onRoll(result); // Persist the selected game before starting any animation.
    const nextRotation = landingRotation(
      rotation,
      preview.findIndex((g) => g.id === game.id),
      preview.length,
    );
    if (instant || reduced || games.length === 1) {
      setRotation(nextRotation);
      finish(result);
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setRotation(nextRotation)),
    );
    timer.current = setTimeout(() => finish(result), 3700);
  }
  return (
    <div className="play-grid">
      <section className="wheel-panel" aria-labelledby="wheel-title">
        <div className="panel-heading">
          <span className="eyebrow">THE DECISION MAKER</span>
          <span className="small muted">{games.length} eligible</span>
        </div>
        <h2 id="wheel-title">What are we playing?</h2>
        <div className="wheel-stage">
          <div className="wheel-pointer" aria-hidden="true" />
          <div className="wheel-ring">
            <svg
              aria-hidden="true"
              viewBox="0 0 400 400"
              className="wheel-svg"
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration: instant || reduced ? '0ms' : '3500ms',
              }}
            >
              {displayed.length === 1 ? (
                <circle cx="200" cy="200" r="185" fill={palette[0]} />
              ) : displayed.length ? (
                displayed.map((game, i) => (
                  <path
                    key={game.id}
                    d={slice(i, displayed.length)}
                    fill={palette[i % palette.length]}
                    stroke="#171817"
                    strokeWidth="2"
                  />
                ))
              ) : (
                <circle cx="200" cy="200" r="185" fill="#272b27" />
              )}
              {displayed.map((game, i) => {
                const angle = ((i + 0.5) * 360) / displayed.length;
                return (
                  <g key={game.id} transform={`rotate(${angle},200,200)`}>
                    <text
                      x="200"
                      y="65"
                      textAnchor="middle"
                      transform="rotate(90,200,65)"
                      fill="#fff9f1"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {game.name.length > 18
                        ? game.name.slice(0, 16) + '…'
                        : game.name}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="wheel-hub" aria-hidden="true">
              <Shuffle size={29} />
              <span>NEXT UP</span>
            </div>
          </div>
          <div className="wheel-caption">
            {games.length > 12
              ? `All ${games.length} games have equal odds. The wheel previews 12 names.`
              : games.length
                ? `One game. ${games.length === 1 ? 'One choice.' : 'Equal odds.'}`
                : 'Your next game goes here.'}
          </div>
        </div>
        <button
          className="primary spin-button"
          onClick={() => void spin()}
          disabled={!games.length || spinning}
        >
          <Shuffle size={20} />
          {spinning ? 'Choosing…' : shown ? 'Roll again' : 'Spin the wheel'}
          <span aria-hidden="true">↗</span>
        </button>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
        {!games.length && (
          <p className="hint">
            Add games, loosen your filters, or reset your no-repeat cycle.
          </p>
        )}
      </section>
      <section className="result-panel" aria-label="Selected game">
        <span className="eyebrow">
          {spinning
            ? 'A LITTLE SUSPENSE'
            : shown
              ? 'YOUR NEXT GAME'
              : 'UP NEXT'}
        </span>
        {shown && !spinning ? (
          <>
            <Artwork
              src={shown.game.image}
              name={shown.game.name}
              className="result-art"
            />
            <div className="result-body">
              <span className="platform">{shown.game.platform}</span>
              <h2>{shown.game.name}</h2>
              <p className="muted">{hours(shown.game.minutes)}</p>
              {shown.game.tags.length > 0 && (
                <div className="tags">
                  {shown.game.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
              {shown.game.appId ? (
                <a className="primary" href={`steam://run/${shown.game.appId}`}>
                  Open in Steam <ArrowUpRight size={18} />
                </a>
              ) : (
                <p className="hint">Open {shown.game.platform} to play.</p>
              )}
              <p className="small muted">
                Chosen from {shown.poolSize} games ·{' '}
                {saved ? 'Saved on this device' : 'Not saved: export a backup'}
              </p>
            </div>
          </>
        ) : (
          <div className="result-wait">
            <span className="result-number" aria-hidden="true">
              ?
            </span>
            <h3>
              {spinning ? 'Making the call.' : 'Less choosing. More playing.'}
            </h3>
            <p>
              {spinning
                ? 'Your choice will appear here.'
                : 'Spin when you’re ready. We’ll pick from the games you included.'}
            </p>
            <RotateCw size={24} aria-hidden="true" />
          </div>
        )}
      </section>
    </div>
  );
}
