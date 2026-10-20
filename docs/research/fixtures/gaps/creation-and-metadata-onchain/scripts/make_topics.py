"""Compute event topic0 hashes from the verified manager ABI (raw/manager_impl.json) with Foundry cast keccak (offline)."""
import json, subprocess, os
S = os.environ["SCRATCH"]
abi = json.load(open(S + "/raw/manager_impl.json"))["abi"]
out = {}
for x in abi:
    if x["type"] == "event":
        sig = x["name"] + "(" + ",".join(i["type"] for i in x["inputs"]) + ")"
        out[x["name"]] = {"sig": sig, "topic0": subprocess.check_output(["cast", "keccak", sig], text=True).strip(),
                          "inputs": [(i["name"], i["type"], i["indexed"]) for i in x["inputs"]]}
json.dump(out, open(S + "/work/event_topics.json", "w"), indent=1)
print(len(out), "events")
