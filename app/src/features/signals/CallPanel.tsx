// The controls that start a request. A paid route runs ONLY from the press of its own button, and the button's text
// carries the price from the route table (M3-5). There is no timer, no auto-refresh and no request on load. The
// import box takes the JSON the user's own agent paid for (import mode); it makes no request at all.

import { useRef, useState } from "react";

import { Button, Field, Tile } from "../../ui";
import { MISPRICED_SORTS, MISPRICED_VENUES, QUOTIENT_VENUES, ROUTES, SIGNAL_STATUSES, type MispricedParams, type RouteId, type SignalsParams } from "../../venues/quotient";
import { usdLabel } from "./figures";
import { quotientVenueName } from "./words";

export type PaidRoute = "mispriced" | "signals" | "lookup";
export type ImportRoute = PaidRoute | "performance";

export interface CallPanelProps {
  readonly keyed: boolean;
  readonly busy: RouteId | null;
  readonly done: Readonly<Record<PaidRoute, boolean>>;
  readonly onMispriced: (params: MispricedParams, refresh: boolean) => void;
  readonly onSignals: (params: SignalsParams, refresh: boolean) => void;
  readonly onLookup: (keys: readonly string[], refresh: boolean) => void;
  readonly onImport: (route: ImportRoute, text: string) => void;
}

function pressLabel(name: string, route: PaidRoute, keyed: boolean, done: boolean): string {
  const price = usdLabel(ROUTES[route].priceUsd);
  if (!keyed) return `${done ? "Ask again" : "Ask"} for ${name} (about ${price}, shows the price only)`;
  return done ? `Refresh ${name}: a new charge of about ${price}` : `Get ${name}: about ${price}`;
}

const IMPORT_CHOICES: ReadonlyArray<{ readonly value: ImportRoute; readonly label: string }> = [
  { value: "mispriced", label: "a mispriced-markets list" },
  { value: "signals", label: "a signals list" },
  { value: "lookup", label: "a market lookup" },
  { value: "performance", label: "the track-record snapshot" },
];

export function CallPanel({ keyed, busy, done, onMispriced, onSignals, onLookup, onImport }: CallPanelProps) {
  const [venue, setVenue] = useState("");
  const [minSpread, setMinSpread] = useState("");
  const [sort, setSort] = useState("");
  const [status, setStatus] = useState("active");
  const [signalVenue, setSignalVenue] = useState("");
  const [conviction, setConviction] = useState("");
  const [noDrawdown, setNoDrawdown] = useState(false);
  const [keys, setKeys] = useState("");
  const [importRoute, setImportRoute] = useState<ImportRoute>("mispriced");
  const importText = useRef<HTMLTextAreaElement | null>(null);
  const working = busy !== null;

  const mispriced = (refresh: boolean): void => {
    const params: MispricedParams = {
      ...(venue === "" ? {} : { venue: venue as (typeof MISPRICED_VENUES)[number] }),
      ...(minSpread === "" ? {} : { minSpread }),
      ...(sort === "" ? {} : { sort: sort as (typeof MISPRICED_SORTS)[number] }),
    };
    onMispriced(params, refresh);
  };
  const signals = (refresh: boolean): void => {
    const params: SignalsParams = {
      status: status as (typeof SIGNAL_STATUSES)[number],
      ...(signalVenue === "" ? {} : { venue: signalVenue as (typeof QUOTIENT_VENUES)[number] }),
      ...(conviction === "" ? {} : { minConviction: Number(conviction) as 1 | 2 | 3 }),
      ...(noDrawdown ? { excludeDrawdownRisk: true } : {}),
    };
    onSignals(params, refresh);
  };
  const lookup = (refresh: boolean): void => {
    onLookup(
      keys
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key !== ""),
      refresh,
    );
  };

  return (
    <div className="signals-calls">
      <Tile tone="neutral" title={`Mispriced markets (${usdLabel(ROUTES.mispriced.priceUsd)} a call)`} heading="h3" role="note" dataKind="signals-call" dataCode="mispriced">
        <p className="signals-note">Candidates where Quotient's estimate and a venue quote differ. A ranking aid only. Sends: {ROUTES.mispriced.sends}.</p>
        <div className="signals-form">
          <Field label="Venue">
            {(id) => (
              <select id={id} className="ui-select" value={venue} onChange={(event) => setVenue(event.currentTarget.value)}>
                <option value="">Both</option>
                {MISPRICED_VENUES.map((v) => (
                  <option key={v} value={v}>
                    {quotientVenueName(v)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Smallest gap">
            {(id) => (
              <select id={id} className="ui-select" value={minSpread} onChange={(event) => setMinSpread(event.currentTarget.value)}>
                <option value="">Quotient's default</option>
                <option value="0.02">2 points</option>
                <option value="0.05">5 points</option>
                <option value="0.10">10 points</option>
              </select>
            )}
          </Field>
          <Field label="Order">
            {(id) => (
              <select id={id} className="ui-select" value={sort} onChange={(event) => setSort(event.currentTarget.value)}>
                <option value="">Quotient's default</option>
                {MISPRICED_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <p className="signals-actions">
          <Button variant="primary" busy={busy === "mispriced"} disabled={working} onClick={() => mispriced(done.mispriced)} data-press-route="mispriced">
            {pressLabel("mispriced markets", "mispriced", keyed, done.mispriced)}
          </Button>
        </p>
      </Tile>

      <Tile tone="neutral" title={`Published signals (${usdLabel(ROUTES.signals.priceUsd)} a call)`} heading="h3" role="note" dataKind="signals-call" dataCode="signals">
        <p className="signals-note">Quotient's own list of entries it considers eligible. Sports are experimental. Sends: {ROUTES.signals.sends}.</p>
        <div className="signals-form">
          <Field label="Status">
            {(id) => (
              <select id={id} className="ui-select" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
                {SIGNAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Venue">
            {(id) => (
              <select id={id} className="ui-select" value={signalVenue} onChange={(event) => setSignalVenue(event.currentTarget.value)}>
                <option value="">All</option>
                {QUOTIENT_VENUES.map((v) => (
                  <option key={v} value={v}>
                    {quotientVenueName(v)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Least conviction">
            {(id) => (
              <select id={id} className="ui-select" value={conviction} onChange={(event) => setConviction(event.currentTarget.value)}>
                <option value="">Any</option>
                <option value="1">1 of 3</option>
                <option value="2">2 of 3</option>
                <option value="3">3 of 3</option>
              </select>
            )}
          </Field>
        </div>
        <label className="signals-check">
          <input type="checkbox" checked={noDrawdown} onChange={(event) => setNoDrawdown(event.currentTarget.checked)} />
          <span>Leave out rows with elevated drawdown risk</span>
        </label>
        <p className="signals-actions">
          <Button variant="primary" busy={busy === "signals"} disabled={working} onClick={() => signals(done.signals)} data-press-route="signals">
            {pressLabel("signals", "signals", keyed, done.signals)}
          </Button>
        </p>
      </Tile>

      <Tile tone="neutral" title={`Look up markets (${usdLabel(ROUTES.lookup.priceUsd)} a call)`} heading="h3" role="note" dataKind="signals-call" dataCode="lookup">
        <p className="signals-note">
          Type the market keys you want (like <code>polymarket:123</code>, separated by commas, up to 10). Sends: {ROUTES.lookup.sends}.
        </p>
        <Field label="Market keys">
          {(id) => <input id={id} className="ui-input" type="text" value={keys} maxLength={600} autoComplete="off" spellCheck={false} onChange={(event) => setKeys(event.currentTarget.value)} />}
        </Field>
        <p className="signals-actions">
          <Button variant="primary" busy={busy === "lookup"} disabled={working} onClick={() => lookup(done.lookup)} data-press-route="lookup">
            {pressLabel("these markets", "lookup", keyed, done.lookup)}
          </Button>
        </p>
      </Tile>

      <Tile tone="neutral" title="Import what your own agent saved" heading="h3" role="note" dataKind="signals-call" dataCode="import">
        <p className="signals-note">
          Paste the JSON your own agent saved after paying for a call. It is checked the same way as a live answer, makes no request, and costs nothing here. It is held in memory only.
        </p>
        <Field label="What is it?">
          {(id) => (
            <select id={id} className="ui-select" value={importRoute} onChange={(event) => setImportRoute(event.currentTarget.value as ImportRoute)}>
              {IMPORT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="The saved JSON">{(id) => <textarea id={id} ref={importText} className="ui-input signals-import" rows={6} spellCheck={false} autoComplete="off" />}</Field>
        <p className="signals-actions">
          <Button
            onClick={() => {
              const area = importText.current;
              if (area === null) return;
              const text = area.value;
              area.value = "";
              onImport(importRoute, text);
            }}
          >
            Check and show it
          </Button>
        </p>
      </Tile>
    </div>
  );
}
