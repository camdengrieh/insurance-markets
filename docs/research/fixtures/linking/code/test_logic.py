"""Unit tests for fee, side and optimiser logic (python3 -I test_logic.py).

Vectors come from the venues' own docs where possible:
  Polymarket fee tables:   https://docs.polymarket.com/trading/fees (100 shares)
  Kalshi fee_rounding doc: https://docs.kalshi.com/getting_started/fee_rounding (P=0.055, C=1)
  XO fee example:          https://docs.xo.market/product/trading/fees (200 sh @ 0.50, 4%)
"""
import os
import sys
import unittest
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (Book, Leg, D, book_from_kalshi, book_from_limitless, book_from_polylike,  # noqa: E402
                    evaluate, fee_kalshi, fee_limitless_buy, fee_polymarket, fee_xo, optimise, take)

d = Decimal


class FeeTests(unittest.TestCase):
    def test_polymarket_doc_tables(self):
        # crypto 0.07, 100 shares
        self.assertAlmostEqual(float(fee_polymarket([(d("0.50"), d(100))], "0.07")), 1.75, places=4)
        self.assertAlmostEqual(float(fee_polymarket([(d("0.05"), d(100))], "0.07")), 0.33, delta=0.005)
        self.assertAlmostEqual(float(fee_polymarket([(d("0.99"), d(100))], "0.07")), 0.07, delta=0.005)
        # sports 0.05
        self.assertAlmostEqual(float(fee_polymarket([(d("0.50"), d(100))], "0.05")), 1.25, places=4)
        self.assertAlmostEqual(float(fee_polymarket([(d("0.30"), d(100))], "0.05")), 1.05, places=4)
        # symmetric around 0.5 (docs: 30c and 70c cost the same)
        self.assertEqual(fee_polymarket([(d("0.30"), d(100))], "0.05"), fee_polymarket([(d("0.70"), d(100))], "0.05"))
        # disabled / zero
        self.assertEqual(fee_polymarket([(d("0.5"), d(100))], "0.05", enabled=False), 0)
        self.assertEqual(fee_polymarket([(d("0.5"), d(100))], 0), 0)

    def test_kalshi_doc_example(self):
        # doc: revenue -0.055, model fee 0.00363825 -> trade 0.003639, net fee exactly 0.005 (cent grid)
        f = fee_kalshi([(d("0.055"), d(1))], multiplier=1, grid=d("0.01"))
        self.assertEqual(f, d("0.005000"))

    def test_kalshi_general(self):
        # 100 @ 0.50 -> 0.07*100*0.25 = 1.75 exactly on the cent grid
        self.assertEqual(fee_kalshi([(d("0.50"), d(100))]), d("1.75"))
        # 1 contract @ 0.50 -> model 0.0175, buyer pays 0.5175 -> aligned up to 0.52 -> fee 0.02
        self.assertEqual(fee_kalshi([(d("0.50"), d(1))]), d("0.02"))
        # direct member grid 0.0001
        self.assertEqual(fee_kalshi([(d("0.50"), d(1))], grid=d("0.0001")), d("0.0175"))
        # multiplier 0.5 halves the model fee
        self.assertEqual(fee_kalshi([(d("0.50"), d(100))], multiplier=0.5), d("0.88"))
        # multiplier 0 (fee-free series)
        self.assertEqual(fee_kalshi([(d("0.50"), d(100))], multiplier=0), d("0"))

    def test_xo_doc_example(self):
        self.assertEqual(fee_xo([(d("0.50"), d(200))], 400), d("2.000000"))
        # two 100-share fills = same total
        self.assertEqual(fee_xo([(d("0.50"), d(100)), (d("0.50"), d(100))], 400), d("2.000000"))
        self.assertEqual(fee_xo([(d("0.50"), d(200))], 0), 0)

    def test_limitless(self):
        # <= 0.50 buy fee is 3%
        self.assertEqual(fee_limitless_buy([(d("0.40"), d(100))]), d("0.03") * d("0.40") * 100)
        # at 0.60 table says 2.13%
        self.assertAlmostEqual(float(fee_limitless_buy([(d("0.60"), d(100))])), 0.0213 * 60, places=6)
        # interpolation between 0.55 (2.52%) and 0.60 (2.13%)
        mid = fee_limitless_buy([(d("0.575"), d(100))]) / (d("0.575") * 100)
        self.assertTrue(d("0.0213") < mid < d("0.0252"))
        self.assertEqual(fee_limitless_buy([(d("0.4"), d(100))], enabled=False), 0)


class BookTests(unittest.TestCase):
    def test_kalshi_side_logic(self):
        ob = {"no_dollars": [["0.5700", "3007.01"], ["0.6100", "229301.30"]],
              "yes_dollars": [["0.3400", "16334.25"], ["0.3800", "40226.29"]]}
        b = book_from_kalshi(ob)
        self.assertEqual(b.best_bid, d("0.38"))
        self.assertEqual(b.best_ask, d("0.39"))            # 1 - best NO bid 0.61
        self.assertEqual(b.asks[0][1], d("229301.30"))      # size carries over
        self.assertEqual(b.asks[1][0], d("0.43"))           # 1 - 0.57
        self.assertFalse(b.crossed())
        # NO ask = 1 - YES bid
        self.assertEqual(b.no_buy_levels()[0], (d("0.62"), d("40226.29")))

    def test_kalshi_crossed(self):
        b = book_from_kalshi({"yes_dollars": [["0.50", "10"]], "no_dollars": [["0.60", "10"]]})
        self.assertEqual(b.best_ask, d("0.40"))
        self.assertTrue(b.crossed())

    def test_polymarket_best_last_is_sorted(self):
        # Polymarket CLOB returns bids ascending / asks descending (best last)
        j = {"bids": [{"price": "0.01", "size": "5"}, {"price": "0.37", "size": "7"}],
             "asks": [{"price": "0.99", "size": "5"}, {"price": "0.38", "size": "9"}], "timestamp": "1792344875523"}
        b = book_from_polylike(j)
        self.assertEqual(b.best_bid, d("0.37"))
        self.assertEqual(b.best_ask, d("0.38"))
        self.assertEqual(b.ts, 1792344875.523)

    def test_xo_best_first_is_sorted(self):
        j = {"bids": [{"price": "0.40", "size": "5"}, {"price": "0.30", "size": "7"}],
             "asks": [{"price": "0.60", "size": "5"}, {"price": "0.70", "size": "9"}]}
        b = book_from_polylike(j)
        self.assertEqual((b.best_bid, b.best_ask), (d("0.40"), d("0.60")))

    def test_limitless_units(self):
        j = {"bids": [{"price": 0.003, "size": 863898323}], "asks": [{"price": 0.899, "size": 12362000}], "minSize": "100000000"}
        b = book_from_limitless(j)
        self.assertEqual(b.asks[0][1], d("12.362"))
        self.assertEqual(b.min_size, d(100))

    def test_take_walk(self):
        lv = [(d("0.4"), d(10)), (d("0.5"), d(10))]
        self.assertEqual(take(lv, 15), [(d("0.4"), d(10)), (d("0.5"), d(5))])
        self.assertIsNone(take(lv, 25))


class OptimiserTests(unittest.TestCase):
    def nofee(self, fills):
        return d(0)

    def test_exhaustive_buy_all(self):
        a = Leg("A", [(d("0.45"), d(10)), (d("0.50"), d(100))], self.nofee)
        b = Leg("B", [(d("0.50"), d(20))], self.nofee)
        r = optimise([a, b], 1)
        self.assertEqual(r["touch"]["q"], d(10))
        self.assertEqual(r["touch"]["net"], d("0.5"))
        self.assertEqual(r["best"]["net"], d("0.5"))
        self.assertEqual(r["max_depth"], d(20))

    def test_no_arb(self):
        a = Leg("A", [(d("0.5"), d(10))], self.nofee)
        b = Leg("B", [(d("0.5"), d(10))], self.nofee)
        self.assertEqual(optimise([a, b], 1)["best"]["net"], 0)

    def test_fees_flip_sign(self):
        f = lambda fills: fee_kalshi(fills)  # noqa: E731
        a = Leg("A", [(d("0.48"), d(100))], f)
        b = Leg("B", [(d("0.50"), d(100))], f)       # gross 0.02*100 = 2.00
        r = optimise([a, b], 1)
        self.assertEqual(r["best"]["gross"], d("2.00"))
        self.assertLess(r["best"]["net"], 0)          # fees ~1.75+1.75 exceed 2.00

    def test_ladder_package(self):
        # hard leg (K high) priced 0.30 bid -> buy its NO at 0.70; easy leg (K low) ask 0.25.
        easy_yes = Leg("easy YES", [(d("0.25"), d(50))], self.nofee)
        hard_no = Book([(d("0.30"), d(40))], [(d("0.35"), d(40))]).no_buy_levels()
        hard = Leg("hard NO", hard_no, self.nofee)
        r = optimise([easy_yes, hard], 1)    # package pays >= 1
        self.assertEqual(r["best"]["q"], d(40))
        self.assertEqual(r["best"]["net"], d("0.05") * 40)

    def test_depth_insufficient(self):
        a = Leg("A", [(d("0.4"), d(5))], self.nofee)
        self.assertIsNone(evaluate([a], d(6), d(1)))


class ParserTests(unittest.TestCase):
    def setUp(self):
        import textproc
        self.tp = textproc

    def test_direction(self):
        d = self.tp.detect_direction
        self.assertEqual(d("Tyrese Maxey: 2+"), "upper")
        self.assertEqual(d("Will Bitcoin dip to $80,000 in October?"), "lower")
        self.assertEqual(d("Will WTI Crude Oil (WTI) hit (LOW) $75 in October?"), "lower")
        self.assertEqual(d("Will WTI Crude Oil (WTI) hit (HIGH) $95 in October?"), "upper")
        self.assertEqual(d("HYPE price on Oct 18 at 3pm EDT? \u2014 $70.75 or above"), "upper")
        self.assertEqual(d("Will inflation be 3% or less?"), "lower")
        # bare "hit" has no direction: Bitcoin at $50k may be an up- or a down-touch
        self.assertIsNone(d("Will Bitcoin hit $120,000?"))
        # "Under" inside a title is not a threshold direction
        self.assertIsNone(d("Peak US National Debt Under Trump Administration \u2014 $52.5 trillion"))

    def test_dates_and_polarity(self):
        t = self.tp.template
        self.assertTrue(t("Will Bitcoin reach $120,000 by December 31, 2026?")["cumulative"])
        self.assertTrue(t("Will Trump visit China before 2027?")["cumulative"])
        # survival wording flips monotonicity: must NOT be a cumulative date ladder
        self.assertFalse(t("US x Iran ceasefire continues through October 22?")["cumulative"])
        # point-in-time state "be above X by D" is not monotone in D
        self.assertFalse(t("Will BTC be above 100k by Dec 31?")["cumulative"])
        # "before 2027" means by 31 Dec 2026
        e = t("Will Trump visit China before 2027?")["dates"][0][0]
        from datetime import datetime, timezone
        self.assertEqual(datetime.fromtimestamp(e, timezone.utc).year, 2026)
        # a bare "Jan 1" seen in October rolls to next year
        ref = datetime(2026, 10, 18, tzinfo=timezone.utc).timestamp()
        e2 = t("Before Jan 1", default_year=2026, ref_epoch=ref)["dates"][0][0]
        self.assertEqual(datetime.fromtimestamp(e2, timezone.utc).year, 2027)

    def test_numbers(self):
        n = self.tp.find_numbers
        self.assertEqual([x[0] for x in n("above $1,200")], [1200.0])
        self.assertEqual([x[0] for x in n("100k")], [100000.0])
        self.assertEqual([x[0] for x in n("3.5%")], [3.5])
        # bare years are protected from threshold parsing
        self.assertEqual(self.tp.template("Will Spain win the 2026 FIFA World Cup?")["numbers"], [])


class LadderTests(unittest.TestCase):
    def mk(self, key, text, **kw):
        m = {"key": key, "venue": "polymarket", "text": text, "title": text, "yes_label": "Yes", "tradable": True, "event_key": "e"}
        m.update(kw)
        return m

    def test_upper_threshold_pairs(self):
        import ladders
        ms = [self.mk("a", "Will Bitcoin reach $100,000 in October?"), self.mk("b", "Will Bitcoin reach $110,000 in October?")]
        fams = ladders.families_for_group(ms, 2026)
        self.assertEqual(len(fams), 1)
        self.assertEqual(fams[0]["direction"], "upper")
        # easy = lower threshold (100k), hard = 110k
        self.assertEqual(ladders.easy_hard_pairs(fams[0]), [("a", "b")])

    def test_lower_threshold_pairs(self):
        import ladders
        ms = [self.mk("a", "Will Bitcoin dip to $80,000 in October?"), self.mk("b", "Will Bitcoin dip to $70,000 in October?")]
        fams = ladders.families_for_group(ms, 2026)
        # dipping to 80k is EASIER than dipping to 70k
        self.assertEqual(ladders.easy_hard_pairs(fams[0]), [("a", "b")])

    def test_survival_titles_are_not_date_ladders(self):
        import ladders
        ms = [self.mk("a", "Ceasefire continues through October 22?"), self.mk("b", "Ceasefire continues through October 28?")]
        self.assertEqual([f for f in ladders.families_for_group(ms, 2026) if f["kind"] == "date"], [])

    def test_date_ladder_easy_is_later(self):
        import ladders
        ms = [self.mk("a", "Will Trump meet Putin by March 31, 2027?"), self.mk("b", "Will Trump meet Putin by June 30, 2027?")]
        fams = ladders.families_for_group(ms, 2026)
        self.assertEqual(ladders.easy_hard_pairs(fams[0]), [("b", "a")])

    def test_exclusive_kalshi_events_are_skipped(self):
        import ladders
        ms = [self.mk("a", "Launches \u2014 2", venue="kalshi", mutually_exclusive=True, strike_type="less", cap_strike=2),
              self.mk("b", "Launches \u2014 3", venue="kalshi", mutually_exclusive=True, strike_type="less", cap_strike=3)]
        self.assertEqual(ladders.families_for_group(ms, 2026), [])

    def test_kalshi_structured_strike_beats_negative_text_number(self):
        import ladders
        ms = [self.mk("a", "Game Spread \u2014 Rune -3.5 games", venue="kalshi", strike_type="greater", floor_strike=3.5, mutually_exclusive=False),
              self.mk("b", "Game Spread \u2014 Rune -6.5 games", venue="kalshi", strike_type="greater", floor_strike=6.5, mutually_exclusive=False)]
        fams = ladders.families_for_group(ms, 2026)
        self.assertEqual(len(fams), 1)
        # winning by >3.5 games is easier than by >6.5 (text numbers are negative and would invert this)
        self.assertEqual(ladders.easy_hard_pairs(fams[0]), [("a", "b")])


class LinkingTests(unittest.TestCase):
    def test_orientation_same_and_inverse(self):
        import linking
        pm = {"venue": "polymarket", "yes_no": False, "outcomes": ["Cardinals", "Rams"], "title": "Cardinals vs. Rams", "text": "Cardinals vs. Rams", "event_title": "Cardinals vs. Rams"}
        ka = {"venue": "kalshi", "yes_label": "Arizona", "event_title": "ARI Cardinals vs LA Rams", "text": "ARI Cardinals vs LA Rams \u2014 Arizona"}
        self.assertEqual(linking.pick_pm_side(pm, ka), 0)
        self.assertEqual(linking.orientation(pm, ka, 0, 0), "same")
        ka2 = dict(ka, yes_label="Los Angeles", text="ARI Cardinals vs LA Rams \u2014 Los Angeles")
        self.assertEqual(linking.pick_pm_side(pm, ka2), 1)
        xo = {"venue": "xo", "title": "Rams to win vs Cardinals", "text": "Rams to win vs Cardinals", "yes_no": True, "event_title": None}
        # PM side 0 (Cardinals) vs XO subject Rams -> inverse
        self.assertEqual(linking.orientation(pm, xo, 0, 0), "inverse")
        self.assertEqual(linking.orientation(pm, xo, 1, 0), "same")

    def test_draw_is_a_different_outcome(self):
        import linking
        ka = {"venue": "kalshi", "yes_label": "Juventus", "event_title": "Juventus vs Lazio", "text": "Juventus vs Lazio \u2014 Juventus"}
        xo = {"venue": "xo", "title": "Draw: Juventus vs Lazio", "text": "Draw: Juventus vs Lazio", "yes_no": True}
        self.assertEqual(linking.orientation(ka, xo), "different_outcome")

    def test_type_signature_blocks_house_vs_senate(self):
        import linking
        from textproc import norm_tokens
        a, b = set(norm_tokens("Democratic Party control the House")), set(norm_tokens("Democratic Party control the Senate"))
        self.assertNotEqual(linking.type_sig(a), linking.type_sig(b))
        self.assertNotEqual(linking.type_sig(set(norm_tokens("republican wins"))), linking.type_sig(set(norm_tokens("democratic wins"))))


class UniverseTests(unittest.TestCase):
    def test_kalshi_empty_side_is_not_a_quote(self):
        import json, tempfile
        import universe
        ev = {"event_ticker": "E1", "series_ticker": "S1", "title": "T", "mutually_exclusive": False, "markets": [
            {"ticker": "E1-A", "status": "active", "title": "A", "yes_sub_title": "A", "close_time": "2026-12-01T00:00:00Z",
             "yes_bid_dollars": "0.4000", "yes_bid_size_fp": "10.00", "yes_ask_dollars": "0.0000", "yes_ask_size_fp": "0.00",
             "no_bid_dollars": "0.0000", "no_ask_dollars": "0.6000", "rules_primary": "r", "volume_24h_fp": "0", "volume_fp": "0", "open_interest_fp": "0"},
            {"ticker": "E1-B", "status": "active", "title": "B", "yes_sub_title": "B", "close_time": "2026-12-01T00:00:00Z",
             "yes_bid_dollars": "0.0000", "yes_bid_size_fp": "0.00", "yes_ask_dollars": "1.0000", "yes_ask_size_fp": "0.00",
             "rules_primary": "r", "volume_24h_fp": "0", "volume_fp": "0", "open_interest_fp": "0"}]}
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "listings"))
            json.dump({"events": [ev], "series_fee": {"S1": {"fee_type": "quadratic", "fee_multiplier": 1}}, "_fetched_epoch": 0},
                      open(os.path.join(d, "listings", "kalshi.json"), "w"))
            out, events, snap = universe.load_kalshi(d)
        a, b = {m["ticker"]: m for m in out}["E1-A"], {m["ticker"]: m for m in out}["E1-B"]
        self.assertEqual(a["bid"], Decimal("0.4"))
        self.assertIsNone(a["ask"])            # "0.0000"/size 0 means NO ask, not an ask at zero dollars
        self.assertTrue(a["quoted"])
        self.assertIsNone(b["bid"])
        self.assertIsNone(b["ask"])            # ask 1.0000 with size 0 is also empty
        self.assertFalse(b["quoted"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
