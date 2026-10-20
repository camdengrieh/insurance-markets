"""Normalise the raw venue listings into one flat 'market' schema (python3 -I, stdlib only).

A normalised market (dict) always has:
  key, venue, event_key, title, label, text, end (epoch s or None), rules, tradable,
  yes_label, no_label, bid, ask (listing top-of-book for the YES instrument, Decimal or None),
  bid_sz, ask_sz, tokens {yes,no}, fee {...}, liq, vol24, url, plus venue-specific extras.

`text` is the claim wording used for linking (event/market title plus outcome label).
"""
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import D  # noqa: E402

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(s):
    if not s:
        return ""
    s = TAG_RE.sub(" ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_iso(s):
    if not s:
        return None
    s = s.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()
        s2 = s.replace("Z", "+00:00")
        s2 = re.sub(r"\+00$", "+00:00", s2)
        s2 = s2.replace(" ", "T", 1) if re.match(r"\d{4}-\d{2}-\d{2} \d", s2) else s2
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def jl(x):
    """Gamma returns JSON-encoded strings for arrays."""
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return []
    return x or []


def dnone(x):
    try:
        return D(x)
    except Exception:
        return None


# --------------------------------------------------------------------------
# Polymarket
# --------------------------------------------------------------------------
def load_polymarket(raw):
    P = json.load(open(os.path.join(raw, "listings", "polymarket.json")))
    snap = P["_fetched_epoch"]
    events_full = P["events_full"]
    ev_meta = {}
    for eid, e in events_full.items():
        ev_meta[str(eid)] = e
    allm = {}
    for m in P["markets"]:
        allm[m["conditionId"]] = (m, None)
    for eid, e in events_full.items():
        for m in e.get("markets", []):
            allm[m["conditionId"]] = (m, e)
    out = []
    for cid, (m, efull) in allm.items():
        ev = efull or ((m.get("events") or [{}])[0])
        eid = str(ev.get("id", "")) or "none"
        outcomes = jl(m.get("outcomes"))
        ver = m.get("version")
        toks = jl(m.get("positionIds")) if ver == "v2" else jl(m.get("clobTokenIds"))
        if len(toks) < 2 or len(outcomes) < 2:
            continue
        fs = m.get("feeSchedule") or {}
        tradable = bool(m.get("active") and not m.get("closed") and m.get("acceptingOrders") and m.get("enableOrderBook"))
        end = parse_iso(m.get("endDate") or ev.get("endDate"))
        title = m.get("question") or ""
        label = m.get("groupItemTitle") or None
        tags = [t.get("label") for t in (ev.get("tags") or []) if isinstance(t, dict)]
        rules = ((m.get("description") or "") + (" | resolutionSource: " + m["resolutionSource"] if m.get("resolutionSource") else "")).strip()
        out.append({
            "key": "pm:" + cid, "venue": "polymarket", "cid": cid,
            "event_key": "pm:ev:" + eid, "event_id": eid, "event_slug": ev.get("slug"), "event_title": ev.get("title"),
            "event_complete": efull is not None,
            "title": title, "label": label, "text": title,
            "yes_label": outcomes[0], "no_label": outcomes[1], "outcomes": outcomes,
            "yes_no": [o.lower() for o in outcomes[:2]] == ["yes", "no"],
            "end": end, "rules": rules, "tradable": tradable,
            "active": m.get("active"), "closed": m.get("closed"), "accepting": m.get("acceptingOrders"),
            "past_end": bool(end and end < snap),
            "bid": dnone(m.get("bestBid")), "ask": dnone(m.get("bestAsk")), "bid_sz": None, "ask_sz": None,
            "tokens": {"yes": toks[0], "no": toks[1]}, "version": ver,
            "neg_risk": bool(m.get("negRisk")), "neg_risk_other": bool(m.get("negRiskOther")),
            "neg_risk_market_id": ev.get("negRiskMarketID"), "neg_risk_augmented": bool(ev.get("negRiskAugmented")),
            "group_threshold": m.get("groupItemThreshold"),
            "fee": {"enabled": bool(m.get("feesEnabled")), "rate": fs.get("rate"), "exponent": fs.get("exponent", 1),
                    "type": m.get("feeType")},
            "tick": dnone(m.get("orderPriceMinTickSize")), "min_size": dnone(m.get("orderMinSize")),
            "liq": float(m.get("liquidityNum") or m.get("liquidityClob") or 0),
            "vol24": float(m.get("volume24hr") or 0), "vol": float(m.get("volumeNum") or 0),
            "url": "https://polymarket.com/event/" + str(ev.get("slug") or ""), "slug": m.get("slug"),
            "uma_status": m.get("umaResolutionStatuses"), "restricted": m.get("restricted"),
            "sports_type": m.get("sportsMarketType"), "tags": tags, "game": ev.get("gameId"),
            "resolution_source": m.get("resolutionSource"),
            "last_trade": dnone(m.get("lastTradePrice")), "spread": dnone(m.get("spread")),
            "updated": parse_iso(m.get("updatedAt")),
        })
    return out, snap


# --------------------------------------------------------------------------
# Kalshi
# --------------------------------------------------------------------------
def load_kalshi(raw):
    K = json.load(open(os.path.join(raw, "listings", "kalshi.json")))
    snap = K["_fetched_epoch"]
    fee = K["series_fee"]
    out, events = [], {}
    for e in K["events"]:
        ms = e.get("markets") or []
        ser = e.get("series_ticker")
        f = fee.get(ser, {})
        events[e["event_ticker"]] = {"event_ticker": e["event_ticker"], "title": e.get("title"), "sub_title": e.get("sub_title"),
                                     "series": ser, "mutually_exclusive": bool(e.get("mutually_exclusive")),
                                     "collateral_return_type": e.get("collateral_return_type"),
                                     "category": e.get("category"), "n_markets": len(ms),
                                     "settlement_sources": [s.get("name") for s in (e.get("settlement_sources") or [])][:6],
                                     "strike_period": e.get("strike_period")}
        multi = len(ms) > 1
        for m in ms:
            if m.get("status") != "active":
                continue
            yb, ya = dnone(m.get("yes_bid_dollars")), dnone(m.get("yes_ask_dollars"))
            ybs, yas = dnone(m.get("yes_bid_size_fp")), dnone(m.get("yes_ask_size_fp"))
            # an empty side is encoded as price 0.0000 / size 0.00 in the listing: treat as missing
            if yb is not None and (yb <= 0 or (ybs is not None and ybs <= 0)):
                yb = None
            if ya is not None and (ya <= 0 or ya >= 1 or (yas is not None and yas <= 0)):
                ya = None
            quoted = bool(yb is not None or ya is not None)
            ysub = m.get("yes_sub_title") or ""
            title = m.get("title") or ""
            etitle = e.get("title") or ""
            if multi and ysub:
                text = f"{etitle} — {ysub}"
            else:
                text = title or etitle
            end = parse_iso(m.get("close_time"))
            exp = parse_iso(m.get("expected_expiration_time")) or parse_iso(m.get("expiration_time"))
            out.append({
                "key": "ka:" + m["ticker"], "venue": "kalshi", "ticker": m["ticker"],
                "event_key": "ka:ev:" + e["event_ticker"], "event_ticker": e["event_ticker"], "series": ser,
                "event_title": etitle, "event_sub_title": e.get("sub_title"),
                "title": title, "label": ysub or None, "text": text,
                "yes_label": ysub or "Yes", "no_label": m.get("no_sub_title") or "No",
                "end": end, "expected_end": exp,
                "rules": ((m.get("rules_primary") or "") + " " + (m.get("rules_secondary") or "")).strip(),
                "tradable": True, "quoted": quoted,
                "bid": yb, "ask": ya, "bid_sz": ybs, "ask_sz": yas,
                "no_bid": dnone(m.get("no_bid_dollars")), "no_ask": dnone(m.get("no_ask_dollars")),
                "tokens": {"yes": m["ticker"], "no": m["ticker"]},
                "mutually_exclusive": bool(e.get("mutually_exclusive")), "collateral_return_type": e.get("collateral_return_type"),
                "n_event_markets": len(ms), "category": e.get("category"),
                "strike_type": m.get("strike_type"), "floor_strike": m.get("floor_strike"), "cap_strike": m.get("cap_strike"),
                "custom_strike": m.get("custom_strike"), "can_close_early": m.get("can_close_early"),
                "fee": {"type": f.get("fee_type"), "multiplier": f.get("fee_multiplier")},
                "liq": 0.0, "vol24": float(m.get("volume_24h_fp") or 0), "vol": float(m.get("volume_fp") or 0),
                "oi": float(m.get("open_interest_fp") or 0),
                "last_trade": dnone(m.get("last_price_dollars")),
                "url": "https://kalshi.com/markets/" + (ser or "").lower() + "/" + e["event_ticker"].lower(),
                "updated": parse_iso(m.get("updated_time")), "price_ranges": m.get("price_ranges"),
                "settlement_sources": events[e["event_ticker"]]["settlement_sources"],
            })
    return out, events, snap


# --------------------------------------------------------------------------
# XO
# --------------------------------------------------------------------------
def load_xo(raw):
    X = json.load(open(os.path.join(raw, "listings", "xo.json")))
    snap = X["_fetched_epoch"]
    out = []
    for m in X["markets"]:
        outs = sorted(m.get("outcomes") or [], key=lambda o: o.get("index", 0))
        if len(outs) < 2:
            continue
        rules = m.get("rules") or {}
        rtxt = json.dumps(rules)[:3000] if rules else ""
        out.append({
            "key": "xo:" + m["conditionId"], "venue": "xo", "cid": m["conditionId"], "id": m["id"], "type": m.get("type"),
            "event_key": "xo:m:" + str(m["id"]), "title": m.get("title") or "", "label": None, "text": m.get("title") or "",
            "yes_label": outs[0].get("title"), "no_label": outs[1].get("title"),
            "end": parse_iso(m.get("expiresAt")), "rules": rtxt,
            "resolution_sources": m.get("resolutionSources"), "resolution_type": m.get("resolutionType"),
            "tradable": m.get("status") == "ACTIVE", "status": m.get("status"),
            "bid": None, "ask": None, "bid_sz": None, "ask_sz": None,
            "tokens": {"yes": outs[0].get("outcomeTokenId"), "no": outs[1].get("outcomeTokenId")},
            "last_yes": dnone(outs[0].get("currentPrice")) / Decimal(10 ** 6) if outs[0].get("currentPrice") else None,
            "fee": {"bps": None}, "liq": 0.0, "vol24": 0.0, "vol": float(m.get("totalVolumeInUSD") or 0),
            "slug": m.get("slug"), "url": "https://xo.market/markets/" + str(m.get("slug") or ""),
            "category": [c.get("name") for c in (m.get("categoryPath") or [])],
            "creator_bps": m.get("creatorBps"),
        })
    return out, snap


# --------------------------------------------------------------------------
# Limitless (flatten group markets)
# --------------------------------------------------------------------------
def load_limitless(raw):
    L = json.load(open(os.path.join(raw, "listings", "limitless.json")))
    snap = L["_fetched_epoch"]
    out = []

    def add(m, parent=None):
        if m.get("tradeType") != "clob":
            return
        prices = m.get("prices") or []
        toks = m.get("tokens") or {}
        if not toks.get("yes"):
            return
        title = m.get("title") or ""
        gtitle = parent.get("title") if parent else None
        text = f"{gtitle} {title}" if gtitle else title
        md = m.get("metadata") or {}
        sett = m.get("settings") or {}
        out.append({
            "key": "lm:" + m["slug"], "venue": "limitless", "slug": m["slug"],
            "event_key": "lm:g:" + str(parent["id"] if parent else m["slug"]), "group_title": gtitle,
            "title": title, "label": title if parent else None, "text": text,
            "yes_label": "Yes", "no_label": "No",
            "end": (m.get("expirationTimestamp") or 0) / 1000.0 or None,
            "rules": strip_html(m.get("description") or (parent or {}).get("description") or ""),
            "tradable": m.get("status") == "FUNDED" and not m.get("expired"),
            "bid": None, "ask": None, "bid_sz": None, "ask_sz": None,
            "tokens": {"yes": toks.get("yes"), "no": toks.get("no")},
            "list_price_yes": dnone(prices[0]) if prices else None,
            "fee": {"enabled": bool(md.get("fee")), "fee_rate_bps": sett.get("feeRateBps")},
            "external_slug": md.get("externalSlug"), "is_poly_arb": md.get("isPolyArbitrage"),
            "is_other": m.get("isOther"), "min_size": dnone(sett.get("minSize")),
            "liq": 0.0, "vol24": 0.0, "vol": float(m.get("volumeFormatted") or 0),
            "url": "https://limitless.exchange/markets/" + m["slug"], "category": m.get("categories"),
            "automation": m.get("automationType"), "group_id": parent["id"] if parent else None,
        })

    for m in L["markets"]:
        if m.get("marketType") == "group" and m.get("markets"):
            for c in m["markets"]:
                c = dict(c)
                c.setdefault("tradeType", m.get("tradeType"))
                c.setdefault("status", m.get("status"))
                c.setdefault("description", m.get("description"))
                add(c, parent=m)
        else:
            add(m)
    return out, snap


def load_all(raw):
    pm, pm_t = load_polymarket(raw)
    ka, kev, ka_t = load_kalshi(raw)
    xo, xo_t = load_xo(raw)
    lm, lm_t = load_limitless(raw)
    return {"polymarket": pm, "kalshi": ka, "xo": xo, "limitless": lm}, {"kalshi_events": kev}, {
        "polymarket": pm_t, "kalshi": ka_t, "xo": xo_t, "limitless": lm_t}


if __name__ == "__main__":
    raw = sys.argv[1]
    U, extra, snaps = load_all(raw)
    for v, ms in U.items():
        t = [m for m in ms if m["tradable"]]
        print(v, len(ms), "tradable", len(t), "snapshot", time.strftime("%FT%TZ", time.gmtime(snaps[v])))
