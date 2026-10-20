"""Cross-venue candidate generation: blocking + fuzzy title similarity (stdlib only).

Pipeline
  1. docs: one per tradable market (token list, number tokens, end time).
  2. blocking: inverted index on rare tokens (idf-weighted) of the *indexed* venue; a query market
     only meets markets sharing weighted rare-token mass; end dates must be within WINDOW_DAYS.
  3. score: sim = 0.55*cos(idf) + 0.25*seq(normalised strings) + 0.20*date_score,
     x0.6 if both sides carry number tokens and the sets differ.
  4. side mapping for non-Yes/No Polymarket markets (team names): choose the outcome whose label
     overlaps the other side's YES wording; ambiguous -> dropped.
No resolution-rule reading happens here; that is the audit (audit_prepare.py / audit_labels.json).
"""
import math
import os
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textproc import norm_tokens, number_tokens  # noqa: E402

WINDOW_DAYS = 60
COMMON_DF = 1500

# --- sports nickname -> city aliases (NFL, NBA, NHL, MLB) so "Panthers vs. Eagles" can meet "Carolina vs Philadelphia".
# Tokens are ADDED to the token set (never replace), so ambiguity only adds noise that the date window,
# number check and type signature then filter.
_ALIAS_SRC = """
cardinals:arizona,louis falcons:atlanta ravens:baltimore bills:buffalo panthers:carolina,florida bears:chicago
bengals:cincinnati browns:cleveland cowboys:dallas broncos:denver lions:detroit packers:bay,green texans:houston
colts:indianapolis jaguars:jacksonville chiefs:kansas raiders:las,vegas chargers:angeles rams:angeles dolphins:miami
vikings:minnesota patriots:england saints:orleans giants:york,francisco jets:york,winnipeg eagles:philadelphia
steelers:pittsburgh 49ers:francisco seahawks:seattle buccaneers:tampa titans:tennessee commanders:washington
celtics:boston nets:brooklyn knicks:york 76ers:philadelphia sixers:philadelphia raptors:toronto bulls:chicago
cavaliers:cleveland pistons:detroit pacers:indiana bucks:milwaukee hawks:atlanta hornets:charlotte heat:miami
magic:orlando wizards:washington nuggets:denver timberwolves:minnesota thunder:oklahoma blazers:portland jazz:utah
warriors:golden,state clippers:angeles lakers:angeles suns:phoenix kings:sacramento,angeles mavericks:dallas
rockets:houston grizzlies:memphis pelicans:orleans spurs:antonio
bruins:boston sabres:buffalo flyers:philadelphia penguins:pittsburgh capitals:washington hurricanes:carolina
lightning:tampa islanders:york rangers:york,texas devils:jersey blackhawks:chicago stars:dallas avalanche:colorado
wild:minnesota predators:nashville blues:louis flames:calgary oilers:edmonton canucks:vancouver canadiens:montreal
senators:ottawa leafs:toronto ducks:anaheim sharks:jose golden:vegas knights:vegas kraken:seattle coyotes:utah
yankees:york mets:york redsox:boston sox:boston,chicago orioles:baltimore rays:tampa guardians:cleveland tigers:detroit
royals:kansas twins:minnesota astros:houston mariners:seattle athletics:oakland angels:angeles rangers:texas
braves:atlanta marlins:miami phillies:philadelphia nationals:washington cubs:chicago reds:cincinnati brewers:milwaukee
pirates:pittsburgh dodgers:angeles padres:diego rockies:colorado diamondbacks:arizona
"""
ALIASES = {}
for _tok in _ALIAS_SRC.split():
    if ":" in _tok:
        _nick, _cities = _tok.split(":", 1)
        ALIASES.setdefault(_nick, set()).update(_cities.split(","))

DISCRIM = {"over", "under", "spread", "handicap", "draw", "tie", "correct", "exact", "half", "1st", "2nd", "total", "totals",
           "both", "btts", "corners", "cards", "goals", "points", "yards", "touchdowns", "assists", "rebounds", "strikeouts",
           "hits", "runs", "sets", "games", "map", "round", "quarter", "moneyline", "scorer", "anytime", "mvp", "margin",
           "ou", "o", "u", "set", "game", "period", "overtime", "ot", "shutout", "first", "second", "third", "team", "player",
           "receptions", "passing", "rushing", "receiving", "sacks", "interceptions", "saves", "shots",
           # offices / contest types: "House" vs "Senate", "VP" vs "presidential" must not match
           "house", "senate", "governor", "president", "vice", "vp", "nominee", "mayor", "congress", "primary", "caucus",
           "runoff", "gubernatorial", "midterm", "midterms", "champion", "relegated", "promoted", "qualify", "qualifiers",
           "quarterfinalists", "semifinalists", "finalists", "mvp", "rookie", "coach", "draft", "pick", "seed",
           "republican", "republicans", "democratic", "democrat", "democrats", "gop", "independent", "independents"}

# light canonicalisation of near-synonyms before type-signature comparison
CANON = {"nomination": "nominee", "presidential": "president", "gubernatorial": "governor", "championship": "champion",
         "ou": "over", "o": "over", "u": "under", "totals": "total", "midterms": "midterm",
         "republicans": "republican", "gop": "republican", "democrats": "democratic", "democrat": "democratic",
         "independents": "independent"}


def _expand(tset):
    extra = set()
    for t in tset:
        if t in ALIASES:
            extra |= ALIASES[t]
    return tset | extra


def type_sig(tset):
    return frozenset(CANON.get(t, t) for t in tset if t in DISCRIM or t in CANON)


def _doc(m):
    toks = norm_tokens(m["text"])
    lab = norm_tokens(m.get("label") or "") if m.get("label") else []
    ends = [e for e in (m.get("end"), m.get("expected_end")) if e]
    tset = _expand(set(toks))
    return {"key": m["key"], "venue": m["venue"], "toks": toks, "tset": tset, "sig": type_sig(set(toks)), "nums": number_tokens(m["text"]),
            "ends": ends, "norm": " ".join(toks), "label_toks": set(lab)}


def build_docs(universe, venues, include=lambda m: True):
    docs = {}
    for v in venues:
        for m in universe[v]:
            if not m.get("tradable"):
                continue
            if v == "kalshi" and not m.get("quoted"):
                continue
            if not include(m):
                continue
            docs[m["key"]] = _doc(m)
    return docs


def idf_table(docs):
    n = len(docs)
    df = Counter()
    for d in docs.values():
        df.update(d["tset"])
    return {t: math.log((n + 1) / (c + 0.5)) for t, c in df.items()}, df


def date_score(a, b):
    if not a["ends"] or not b["ends"]:
        return 0.3                      # unknown: neutral-low
    gap = min(abs(x - y) for x in a["ends"] for y in b["ends"]) / 86400.0
    if gap <= 2:
        return 1.0
    if gap <= 14:
        return 0.7
    if gap <= WINDOW_DAYS:
        return 0.3
    return 0.0


def cosine(a, b, idf):
    inter = a["tset"] & b["tset"]
    if not inter:
        return 0.0
    num = sum(idf[t] ** 2 for t in inter)
    na = math.sqrt(sum(idf[t] ** 2 for t in a["tset"]))
    nb = math.sqrt(sum(idf[t] ** 2 for t in b["tset"]))
    return num / (na * nb) if na and nb else 0.0


RARE_IDF = 4.0


def rare_mismatch(a, b, idf):
    """Share of the idf^2 mass of the RARE tokens (names, places, numbers) of one side that the other
    side lacks; take the worse side. 0 = same rare vocabulary, 1 = disjoint."""
    worst = 0.0
    for x, y in ((a, b), (b, a)):
        rare = [t for t in x["tset"] if idf.get(t, 0) >= RARE_IDF]
        tot = sum(idf[t] ** 2 for t in rare)
        if tot <= 0:
            continue
        miss = sum(idf[t] ** 2 for t in rare if t not in y["tset"])
        worst = max(worst, miss / tot)
    return worst


def candidates(docs_q, docs_i, idf, df, topk=8, min_cos=0.40):
    """For each query doc find up to `topk` best doc in the indexed set."""
    index = defaultdict(list)
    for k, d in docs_i.items():
        for t in d["tset"]:
            if df[t] <= COMMON_DF:
                index[t].append(k)
    out = []
    for kq, q in docs_q.items():
        acc = Counter()
        for t in q["tset"]:
            if df[t] > COMMON_DF:
                continue
            w = idf[t]
            for ki in index.get(t, ()):
                acc[ki] += w
        if not acc:
            continue
        pool = [ki for ki, _ in acc.most_common(60)]
        scored = []
        for ki in pool:
            i = docs_i[ki]
            ds = date_score(q, i)
            if ds <= 0.0:
                continue
            c = cosine(q, i, idf)
            if c < min_cos:
                continue
            scored.append((c, ds, ki))
        scored.sort(reverse=True)
        for c, ds, ki in scored[:topk]:
            i = docs_i[ki]
            seq = SequenceMatcher(None, q["norm"], i["norm"]).ratio()
            nconf = bool(q["nums"] and i["nums"] and q["nums"] != i["nums"])
            sim = 0.55 * c + 0.25 * seq + 0.20 * ds
            sig_mismatch = q["sig"] != i["sig"]
            if nconf:
                sim *= 0.6
            if sig_mismatch:
                sim *= 0.5
            rm = rare_mismatch(q, i, idf)
            sim *= (1.0 - 0.5 * rm)
            out.append({"a": kq, "b": ki, "cos": round(c, 4), "seq": round(seq, 4), "date": ds,
                        "num_conflict": nconf, "sig_mismatch": sig_mismatch, "rare_mismatch": round(rm, 3), "sim": round(sim, 4),
                        "naive": round(0.7 * c + 0.3 * seq, 4)})
    return out


def pick_pm_side(pm, other):
    """For a Polymarket market whose outcomes are not Yes/No, choose which outcome token plays
    'YES' for the other venue's claim. Returns 0, 1 or None (ambiguous)."""
    if pm["yes_no"]:
        return 0
    subj, _ = subject_of(other)
    if subj is None:
        subj = set(norm_tokens(other.get("yes_label") or "")) if (other.get("yes_label") or "").lower() not in ("yes", "no") else set()
    if not subj:
        return None
    s = []
    for lab in pm["outcomes"][:2]:
        lt = _tok(lab)
        s.append(_ov(lt, subj))
    if abs(s[0] - s[1]) < 0.4 or max(s) < 0.5:
        return None
    return 0 if s[0] > s[1] else 1


def link_venues(universe, pairs=(("polymarket", "kalshi"), ("polymarket", "xo"), ("polymarket", "limitless"),
                                 ("kalshi", "xo"), ("kalshi", "limitless"), ("xo", "limitless")), min_sim=0.0):
    venues = sorted({v for p in pairs for v in p})
    docs = build_docs(universe, venues)
    idf, df = idf_table(docs)
    by_venue = defaultdict(dict)
    for k, d in docs.items():
        by_venue[d["venue"]][k] = d
    res = []
    for qv, iv in pairs:
        cs = candidates(by_venue[qv], by_venue[iv], idf, df)
        for c in cs:
            c["va"], c["vb"] = qv, iv
        res.extend(cs)
    return res, docs


def explicit_hint_links(universe):
    """Limitless markets carry metadata.externalSlug (a Polymarket slug) and isPolyArbitrage."""
    pm_by_slug = {}
    for m in universe["polymarket"]:
        if m.get("slug"):
            pm_by_slug[m["slug"]] = m
    out = []
    for m in universe["limitless"]:
        es = m.get("external_slug")
        if es and es in pm_by_slug:
            out.append({"a": pm_by_slug[es]["key"], "b": m["key"], "va": "polymarket", "vb": "limitless", "hint": "externalSlug"})
    return out


# --------------------------------------------------------------------------
# YES-side orientation for head-to-head markets
# --------------------------------------------------------------------------
import re  # noqa: E402

H2H = re.compile(r"(\bvs\.?\b|\bv\b|\bversus\b|\bat\b(?!\s+(?:least|most)\b)|\bto win vs\b)", re.I)   # verifier fix 2026-10-19: "at least/at most" is not "A at B"
XO_TOWIN = re.compile(r"^\s*(?P<subj>.+?)\s+to\s+win\s+(?:vs\.?|against|over|v)\s+(?P<opp>.+?)\s*$", re.I)
XO_DRAW = re.compile(r"^\s*draw\s*:\s*(?P<rest>.+)$", re.I)
PM_WILLWIN = re.compile(r"^\s*will\s+(?P<subj>.+?)\s+(?:win|beat|defeat)\b", re.I)


def _tok(x):
    return _expand(set(norm_tokens(x or "")))


def is_h2h(m):
    t = (m.get("event_title") or "") + " " + (m.get("text") or "")
    return bool(H2H.search(t)) or (m["venue"] == "polymarket" and not m["yes_no"] and len(m.get("outcomes") or []) == 2)


def subject_of(m, side=0):
    """(subject tokens, opponent tokens) of the YES claim for head-to-head markets, or (None, None)."""
    v = m["venue"]
    if v == "kalshi":
        if is_h2h(m) and m.get("yes_label") and m["yes_label"].lower() not in ("yes", "tie", "draw"):
            subj = _tok(m["yes_label"])
            parts = re.split(r"\s+(?:vs\.?|v|versus|at|@)\s+", m.get("event_title") or "", maxsplit=1, flags=re.I)
            if len(parts) == 2:
                p0, p1 = _tok(parts[0]), _tok(parts[1])
                # the opponent is the side of the event title that does NOT contain the YES label
                return subj, (p1 if _ov(subj, p0) >= _ov(subj, p1) else p0)
            return subj, _tok(m.get("event_title") or "") - subj
        if (m.get("yes_label") or "").lower() in ("tie", "draw"):
            return {"draw"}, set()
        return None, None
    if v == "xo":
        t = m.get("title") or ""
        md = XO_DRAW.match(t)
        if md:
            return {"draw"}, set()
        mt = XO_TOWIN.match(t)
        if mt:
            return _tok(mt.group("subj")), _tok(mt.group("opp"))
        return None, None
    if v == "polymarket":
        if not m["yes_no"] and len(m.get("outcomes") or []) >= 2:
            return _tok(m["outcomes"][side]), _tok(m["outcomes"][1 - side])
        mw = PM_WILLWIN.match(m.get("title") or "")
        if mw and is_h2h(m):
            return _tok(mw.group("subj")), set()
        if re.search(r"\bend in a draw\b|\bdraw\b", m.get("title") or "", re.I):
            return {"draw"}, set()
        return None, None
    return None, None          # Limitless: no reliable subject field


def _ov(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def orientation(a, b, side_a=0, side_b=0):
    """'same' (YES_a == YES_b), 'inverse' (YES_a == NOT YES_b, only meaningful for 2-way contests),
    'unknown' (head-to-head but subjects unresolved) -- non-h2h pairs are 'same' by construction."""
    ha, hb = is_h2h(a), is_h2h(b)
    if not (ha and hb):
        return "same"
    sa, oa = subject_of(a, side_a)
    sb, ob = subject_of(b, side_b)
    if not sa or not sb:
        return "unknown"
    if sa == {"draw"} or sb == {"draw"}:
        return "same" if sa == sb else "different_outcome"
    same = max(_ov(sa, sb), _ov(oa, ob) if (oa and ob) else 0.0)
    inv = max(_ov(sa, ob) if ob else 0.0, _ov(sb, oa) if oa else 0.0)
    if same >= 0.5 and same > inv:
        return "same"
    if inv >= 0.5 and inv > same:
        return "inverse"
    return "unknown"


def two_way(m):
    """True when the contest has exactly two outcomes (no draw): used to allow 'inverse' links."""
    if m["venue"] == "kalshi":
        return m.get("n_event_markets") == 2
    if m["venue"] == "polymarket":
        return (not m["yes_no"]) and len(m.get("outcomes") or []) == 2
    return False
