"""Split ../link_labels_keyed.json (the human labels recorded for the 2026-10-18 snapshot) into the two files
finalize.py reads: RAW/audit_labels_all.json and RAW/census_labels.json.

  python3 -I restore_labels.py --raw RAW [--labels ../link_labels_keyed.json]

Labels are keyed by '<keyA>|<keyB>' (venue-qualified market ids). On a NEW snapshot only pairs that reappear
reuse a label; new pairs must be read and labelled again (audit_prepare.py prints the rules text).
"""
import argparse
import json
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--labels", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "link_labels_keyed.json"))
    args = ap.parse_args()
    d = json.load(open(args.labels))
    json.dump(d["random_and_positive_edge_audit"], open(os.path.join(args.raw, "audit_labels_all.json"), "w"))
    json.dump(d["positive_edge_census_sim_ge_0.65"], open(os.path.join(args.raw, "census_labels.json"), "w"))
    print("restored", len(d["random_and_positive_edge_audit"]), "audit labels and", len(d["positive_edge_census_sim_ge_0.65"]), "census labels")


if __name__ == "__main__":
    main()
