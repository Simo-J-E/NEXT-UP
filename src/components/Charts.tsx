import { useId, useState } from 'react';
import { dateLabel, money } from '../../shared/core';
export type Point = { at: string; minor: number | null };
export function HistoryChart({
  title,
  points,
}: {
  title: string;
  points: Point[];
}) {
  const id = useId(),
    [days, setDays] = useState(0);
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const span =
    sorted.length > 1
      ? (Date.parse(sorted.at(-1)!.at) - Date.parse(sorted[0]!.at)) / 86400_000
      : 0;
  const choices = [7, 30, 90, 365].filter((n) => span >= n);
  const end = Date.parse(sorted.at(-1)?.at || new Date().toISOString());
  const visible = sorted.filter(
    (p) => !days || Date.parse(p.at) >= end - days * 86400_000,
  );
  const values = visible.flatMap((p) => (p.minor === null ? [] : [p.minor]));
  const min = Math.min(...values, 0),
    max = Math.max(...values, 1),
    start = Date.parse(visible[0]?.at || new Date().toISOString());
  const x = (at: string) =>
    55 + (end === start ? 0.5 : (Date.parse(at) - start) / (end - start)) * 465;
  const y = (v: number) => 155 - ((v - min) / (max - min)) * 125;
  return (
    <section className="chart-block">
      <div className="section-heading">
        <h3>{title}</h3>
        {choices.length > 0 && (
          <label className="small">
            Period{' '}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={0}>All observations</option>
              {choices.map((n) => (
                <option key={n} value={n}>
                  {n === 365 ? '1 year' : `${n} days`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!values.length ? (
        <p className="chart-empty">
          History starts with your first priced observation. No historical
          values have been invented.
        </p>
      ) : (
        <>
          <svg
            className="history-chart"
            viewBox="0 0 550 195"
            role="img"
            aria-labelledby={id}
          >
            <title id={id}>
              {title}. {values.length} priced observations. Values in EUR. Data
              table follows.
            </title>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="55"
                  x2="520"
                  y1={y(min + f * (max - min))}
                  y2={y(min + f * (max - min))}
                  stroke="#393e38"
                />
                <text
                  x="47"
                  y={y(min + f * (max - min)) + 4}
                  textAnchor="end"
                  fill="#b6b9af"
                  fontSize="11"
                >
                  {((min + f * (max - min)) / 100).toFixed(0)} €
                </text>
              </g>
            ))}
            {visible.map((p, i) => {
              const prev = visible[i - 1];
              return (
                <g key={`${p.at}:${i}`}>
                  {p.minor !== null &&
                    prev?.minor != null &&
                    Date.parse(p.at) - Date.parse(prev.at) <= 2 * 86400_000 && (
                      <line
                        x1={x(prev.at)}
                        y1={y(prev.minor)}
                        x2={x(p.at)}
                        y2={y(p.minor)}
                        stroke="#ff8a60"
                        strokeWidth="2"
                      />
                    )}
                  {p.minor !== null && (
                    <circle cx={x(p.at)} cy={y(p.minor)} r="4" fill="#ff8a60">
                      <title>
                        {dateLabel(p.at)}: {money(p.minor)}
                      </title>
                    </circle>
                  )}
                </g>
              );
            })}
            <text x="55" y="185" fill="#b6b9af" fontSize="11">
              {new Date(start).toLocaleDateString('fi-FI')}
            </text>
            <text x="520" y="185" textAnchor="end" fill="#b6b9af" fontSize="11">
              {new Date(end).toLocaleDateString('fi-FI')}
            </text>
          </svg>
          <p className="small muted">
            Observed from {new Date(sorted[0]!.at).toLocaleDateString('fi-FI')}.
            Gaps over two days are left unconnected.
          </p>
        </>
      )}
      {visible.length > 0 && (
        <details>
          <summary>View chart data</summary>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">{title}, in EUR</caption>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => (
                  <tr key={i}>
                    <td>{dateLabel(p.at)}</td>
                    <td>{money(p.minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
export function Bars({
  title,
  rows,
  unit = 'money',
}: {
  title: string;
  rows: { name: string; value: number }[];
  unit?: 'money' | 'hours';
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="chart-block">
      <h3>{title}</h3>
      {rows.length ? (
        <ul className="bar-list">
          {rows.map((row) => (
            <li key={row.name}>
              <div>
                <span>{row.name}</span>
                <strong>
                  {unit === 'money'
                    ? money(row.value)
                    : `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 }).format(row.value / 60)} h`}
                </strong>
              </div>
              <div className="bar-track" aria-hidden="true">
                <span style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="chart-empty">No data available yet.</p>
      )}
    </section>
  );
}
