"""Title parsing: numbers/thresholds, dates, direction words, templates (stdlib only)."""
import re
import unicodedata
from datetime import datetime, timezone

MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}
MONTHS.update({"jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10,
               "nov": 11, "dec": 12})
MON = "|".join(sorted(MONTHS, key=len, reverse=True))

SUFFIX = {"k": 1e3, "m": 1e6, "mm": 1e6, "mn": 1e6, "b": 1e9, "bn": 1e9, "t": 1e12, "thousand": 1e3,
          "million": 1e6, "billion": 1e9, "trillion": 1e12}

# date patterns (order matters: most specific first)
DATE_PATTERNS = [
    # "October 18, 2026" / "Oct 18 2026" / "October 18th, 2026"
    (re.compile(rf"\b({MON})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,)?\s+(20\d\d)\b", re.I), "mdy"),
    # "18 October 2026"
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({MON})\.?,?\s+(20\d\d)\b", re.I), "dmy"),
    # 2026-10-18
    (re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b"), "iso"),
    # "October 18" (no year)
    (re.compile(rf"\b({MON})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?!\s*,?\s*20\d\d)", re.I), "md"),
    # "October 2026" / "Oct. 2026"
    (re.compile(rf"\b({MON})\.?,?\s+(20\d\d)\b", re.I), "my"),
    # Q1 2027
    (re.compile(r"\bQ([1-4])\s*(20\d\d)\b", re.I), "qy"),
    # "end of 2026", "in 2026", "before 2027", "by 2027" -> year
    (re.compile(r"\b(?:end of|eoy|in|by|before|during|for|of)\s+(20\d\d)\b", re.I), "y"),
    # bare month name ("in October", "by December")
    (re.compile(rf"\b(?:in|by|before|during|through|until|end of)\s+({MON})\b(?!\s*\d)", re.I), "m"),
]

# Occurrence-by-date wording: P(event has happened by D) is NON-DECREASING in D.
CUMULATIVE_WORDS = re.compile(r"\b(by|before|prior to|no later than|on or before|within|at any point|any time|"
                              r"at some point|reach|reaches|hit|hits|touch)\b", re.I)
# Survival / persistence / negation wording flips the monotonic direction (or breaks it), so
# such titles are never used in date ladders (e.g. "ceasefire continues through Oct 22?").
PERSIST_NEG = re.compile(r"\b(not|no|never|without|neither|nobody|none|remain|remains|remaining|continue|continues|"
                         r"continuing|still|hold|holds|stay|stays|survive|survives|last|lasts|through|until|till)\b", re.I)
# "be above X by D" is a point-in-time state (not monotone in D); "reach/hit X by D" is a touch event (monotone).
STATE_WORDS = re.compile(r"(\babove\b|\bbelow\b|\bover\b|\bunder\b|\bat least\b|\bat most\b|\bmore than\b|\bless than\b|"
                         r"\bhigher\b|\blower\b|\bexceed|\bfewer\b|\bbetween\b|\bequal|[<>≥≤↑↓])", re.I)
TOUCH_WORDS = re.compile(r"\b(reach|reaches|hit|hits|touch|touches|dip to|dips to|drop to|drops to|fall to|falls to)\b", re.I)
_NUM = r"[\$€£]?\s*-?\d"
UP_PRE = re.compile(rf"(?:\b(?:above|over|more than|at least|greater than|exceed(?:s|ing)?|higher than|reach(?:es)?|surpass(?:es)?|"
                    rf"up to)\b\s*(?:or equal to\s*)?{_NUM}|(?:>=|≥|>|↑)\s*{_NUM}|\(high\)|↑)", re.I)
LO_PRE = re.compile(rf"(?:\b(?:below|under|less than|fewer than|lower than|at most|dip(?:s)? to|drop(?:s)? to|fall(?:s)? to)\b\s*"
                    rf"(?:or equal to\s*)?{_NUM}|(?:<=|≤|<|↓)\s*{_NUM}|\(low\)|↓)", re.I)
UP_POST = re.compile(r"\d[\d,.]*\s*(?:[kmbt]|bn|mm|%)?\s*(?:\+|or\s+(?:more|higher|above|greater|over))", re.I)
LO_POST = re.compile(r"\d[\d,.]*\s*(?:[kmbt]|bn|mm|%)?\s*(?:or\s+(?:less|lower|below|fewer|under))", re.I)


def detect_direction(t):
    up = bool(UP_PRE.search(t) or UP_POST.search(t))
    lo = bool(LO_PRE.search(t) or LO_POST.search(t))
    if up and not lo:
        return "upper"
    if lo and not up:
        return "lower"
    return "both" if up and lo else None


RANGE_WORDS = re.compile(r"(\bbetween\b|\d\s*[-–]\s*\d|\bfrom\b.*\bto\b.*\d|\brange\b|\bexactly\b|\bequal)", re.I)

NUM_RE = re.compile(r"(?<![\w.])(\$?)(-?\d[\d,]*(?:\.\d+)?)\s*(%|k|mm|mn|bn|m|b|t|thousand|million|billion|trillion)?(?![\w])", re.I)


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def month_end_epoch(y, m):
    nm_y, nm_m = (y + 1, 1) if m == 12 else (y, m + 1)
    return datetime(nm_y, nm_m, 1, tzinfo=timezone.utc).timestamp() - 1


def day_end_epoch(y, m, d):
    try:
        return datetime(y, m, d, 23, 59, 59, tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def find_dates(text, default_year=None, ref_epoch=None):
    """Return (list of (start,end,epoch_end,granularity), masked_text)."""
    found, masked = [], text
    spans = []
    for rx, kind in DATE_PATTERNS:
        for mt in rx.finditer(masked):
            s, e = mt.span()
            if any(not (e <= a or s >= b) for a, b in spans):
                continue
            ep, gran = None, None
            g = mt.groups()
            if kind == "mdy":
                ep, gran = day_end_epoch(int(g[2]), MONTHS[g[0].lower()], int(g[1])), "day"
            elif kind == "dmy":
                ep, gran = day_end_epoch(int(g[2]), MONTHS[g[1].lower()], int(g[0])), "day"
            elif kind == "iso":
                ep, gran = day_end_epoch(int(g[0]), int(g[1]), int(g[2])), "day"
            elif kind == "md":
                if default_year:
                    ep, gran = day_end_epoch(default_year, MONTHS[g[0].lower()], int(g[1])), "day"
                    if ep and ref_epoch and ep < ref_epoch - 45 * 86400:     # "Jan 1" seen in October means next January
                        ep = day_end_epoch(default_year + 1, MONTHS[g[0].lower()], int(g[1]))
                else:
                    ep, gran = None, "day"
            elif kind == "my":
                ep, gran = month_end_epoch(int(g[1]), MONTHS[g[0].lower()]), "month"
            elif kind == "qy":
                y, q = int(g[1]), int(g[0])
                ep, gran = month_end_epoch(y, q * 3), "quarter"
            elif kind == "y":
                yy = int(g[0])
                if re.match(r"before\b", mt.group(0), re.I):
                    yy -= 1          # "before 2027" == by 31 Dec 2026
                ep, gran = datetime(yy, 12, 31, 23, 59, 59, tzinfo=timezone.utc).timestamp(), "year"
            elif kind == "m":
                if default_year:
                    ep, gran = month_end_epoch(default_year, MONTHS[g[0].lower()]), "month"
                    if ep and ref_epoch and ep < ref_epoch - 45 * 86400:
                        ep = month_end_epoch(default_year + 1, MONTHS[g[0].lower()])
                else:
                    ep, gran = None, "month"
            spans.append((s, e))
            found.append((s, e, ep, gran, kind))
    found.sort()
    out, last = [], 0
    for s, e, ep, gran, kind in found:
        out.append(masked[last:s])
        out.append(" #D ")
        last = e
    out.append(masked[last:])
    return [(ep, gran) for s, e, ep, gran, k in found], "".join(out)


def find_numbers(text):
    """Numbers in `text` AFTER dates have been masked. Returns list of (value, is_pct, raw)."""
    out = []
    for mt in NUM_RE.finditer(text):
        dollar, num, suf = mt.group(1), mt.group(2), (mt.group(3) or "").lower()
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            continue
        pct = suf == "%"
        if suf in SUFFIX:
            v *= SUFFIX[suf]
        out.append((v, pct, mt.group(0).strip()))
    return out


def mask_numbers(text):
    return NUM_RE.sub(" #N ", text)


def template(text, default_year=None, ref_epoch=None):
    """Return dict(tmpl_full, tmpl_nonum, tmpl_nodate, dates, numbers, direction, cumulative)."""
    t = strip_accents(text or "")
    dates, t_dm = find_dates(t, default_year, ref_epoch)
    # bare years are labels, not thresholds: protect them from number parsing
    t_dm = re.sub(r"(?<![\$\d.,])\b(19|20)(\d\d)\b(?![%\d.,])", r" yr\1\2 ", t_dm)
    t = re.sub(r"(?<![\$\d.,])\b(19|20)(\d\d)\b(?![%\d.,])", r" yr\1\2 ", t)
    nums = find_numbers(t_dm)
    t_nm = mask_numbers(t_dm)

    def cl(s):
        s = re.sub(r"[^a-z0-9#%↑↓≥≤<>+ ]+", " ", s.lower())
        return re.sub(r"\s+", " ", s).strip()

    # template keeping dates but masking numbers: need date text kept -> mask numbers in original with dates intact
    t_numonly = mask_numbers(t)
    direction = detect_direction(t)
    return {
        "tmpl_nonum": cl(t_nm),            # dates & numbers masked
        "tmpl_numonly_masked": cl(t_numonly),  # numbers masked, dates kept (as text)
        "tmpl_datemasked": cl(t_dm),       # dates masked, numbers kept
        "dates": dates, "numbers": nums, "direction": direction,
        "cumulative": bool(CUMULATIVE_WORDS.search(t)) and not PERSIST_NEG.search(t) and (bool(TOUCH_WORDS.search(t)) or not STATE_WORDS.search(t)), "range": bool(RANGE_WORDS.search(t)),
    }


# --------------------------------------------------------------------------
# tokenisation for linking
# --------------------------------------------------------------------------
STOP = set("""a an the of to in on at by for and or is are be been being will would shall can could do does did has have had
that this these those it its as with from than then into out up down vs versus who whom which what when where
any all not if per via about market question""".split())


def norm_tokens(text):
    t = strip_accents(text or "").lower()
    t = t.replace("&", " and ")
    # normalise numbers: 100,000 -> 100000 ; 100k -> 100000 ; 3.5% -> 3.5pct
    def num_sub(mt):
        dollar, num, suf = mt.group(1), mt.group(2), (mt.group(3) or "").lower()
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            return mt.group(0)
        if suf == "%":
            return f" n{v:g}pct "
        if suf in SUFFIX:
            v *= SUFFIX[suf]
        return f" n{v:g} "
    t = NUM_RE.sub(num_sub, t)
    toks = re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", t)
    return [w for w in toks if w not in STOP]


def number_tokens(text):
    return {w for w in norm_tokens(text) if re.fullmatch(r"n-?[0-9.e+]+(pct)?", w)}
