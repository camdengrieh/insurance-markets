# Build the two compact fixtures (third-party addresses truncated) and the 36-row markdown table from the raw outputs in out/.
import json, glob, collections
def sh(a): return a[:8] + ".." + a[-4:]
dec = json.load(open("out/decoded.json"))
act = {x["account_short"]: x for x in json.load(open("out/owner_activity.json"))}
tsmap = {}
for f in glob.glob("out/tx_0x*.json"):
    j = json.load(open(f)); tsmap[j["hash"]] = j.get("timestamp")
rows = []
for r in dec:
    cl = r["call"]
    if "inner" in cl:
        kinds = [{"0x095ea7b3": "approve", "0xa22cb465": "setApprovalForAll", "0xa9059cbb": "transfer"}.get(i["sel"], i["sel"]) + ":" + i["target"][:8] for i in cl["inner"]]
        first = cl["execMode"] + ":" + "+".join(kinds)
    else:
        first = "kernel-v2 execute selector " + str(cl.get("selector"))
    row = dict(tx=r["tx"], utc=(tsmap.get(r["tx"]) or "")[:10], factory=r["factory"], factory_selector=r["factorySelector"], paymaster=r["paymaster"], first_userop_call=first, account=sh(r["sender"]))
    if "decodeError" not in r:
        row.update(salt=r["salt"], init_selector=r["initSelector"], init_sig=r["initSig"], root_validator=r["rootValidator"], hook=r["hook"], validator_data_len=r["validatorDataLen"],
                   hook_data_len=r["hookDataLen"], init_config_len=r["initConfigLen"], init_data_len=r["initDataLen"], owner=sh(r["owner"]), owner_ne_account=r["owner"].lower() != r["sender"].lower())
        a = act.get(sh(r["sender"]))
        if a: row.update(owner_base_nonce=a["base_nonce"], owner_eth_nonce=a["eth_nonce"])
    else:
        fd = r["factoryDataHex"]
        row.update(legacy_createAccount_owner=sh("0x" + fd[10 + 24:10 + 64]), legacy_index=int(fd[10 + 64:10 + 128], 16))
    rows.append(row)
json.dump(dict(note="Decoded from handleOps calldata of 36 deployment txs on chain 3223. Third-party addresses truncated (first 6 / last 4 hex digits); tx hashes are full and reproducible.", rows=rows), open("out/fixture_deployments.json", "w"), indent=1)

def cls(r):
    f = r["first_userop_call"]
    if f.startswith("kernel-v2"): return "v2"
    if "setApprovalForAll" in f: return "ET"
    if f.startswith("0x00:approve"): return "A1"
    if "transfer" in f: return "TR"
    return "X"
def pm(r): return "XO" if r["paymaster"].lower().startswith("0x2353") else "ZeroDev"
lines = ["| # | UTC date | Tx (first 16 hex) | Account | Owner (or legacy owner arg) | Salt/index | Paymaster | First op | Owner Base/ETH nonce |", "|---|---|---|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1):
    legacy = r["factory"].lower().startswith("0x91e6")
    owner = r.get("owner") or r.get("legacy_createAccount_owner")
    salt = "index %s" % r.get("legacy_index") if legacy else "0"
    nonce = "%s / %s" % (r.get("owner_base_nonce"), r.get("owner_eth_nonce")) if "owner_base_nonce" in r else "n/m"
    lines.append("| %d | %s | `%s` | `%s` | `%s` | %s | %s | %s | %s |" % (i, r["utc"], r["tx"][:16], r["account"], owner, salt, pm(r), cls(r), nonce))
open("out/table36.md", "w").write("\n".join(lines) + "\n")
print(collections.Counter(cls(r) for r in rows), "rows:", len(rows))

res = {"_note": "Compact results of the smart-account-derivation stream (gate 3). Third-party addresses truncated. Anvil account 0 (0xf39F..2266) is the public Anvil/Hardhat TEST account."}
res["base_factory_getAddress_vs_local_and_observed"] = [dict(label=x["label"], owner=sh(x["owner"]), local=sh(x["local"]), base_getAddress=sh(x["base_getAddress"]),
    observed_xo_account=sh(x["observed_xo_account"]) if x["observed_xo_account"] else None, local_equals_base=x["local"].lower() == x["base_getAddress"].lower()) for x in json.load(open("out/base_getaddress_results.json"))]
res["anvil0_TEST_counterfactual"] = dict(owner="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", index=0, address="0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d",
    xo_chain_3223_code="none (explorer smart-contracts endpoint 404; no AccountDeployed event)", base_chain_code_bytes=61, base_validator_stored_owner="0xf39fd6e5..2266 (= Anvil account 0)")
res["validator_semantics_probe_base_eth_call_state_override"] = json.load(open("out/validator_probe_results.json"))
res["kernel_fullpath_probe_base"] = json.load(open("out/kernel_fullpath_results.json"))
rv = json.load(open("out/registry_vs_deployed.json"))
res["balance_allowance_smart_account_field"] = dict(observed_owner_EOAs_tested=len(rv), owner_resolves_to_account=sum(1 for x in rv if x["via_owner_smart_account"]),
    registry_nonnull_on_sample=sum(1 for x in rv if x["via_account_smart_account"]), sample_size=len(rv),
    anvil0_TEST_owner="null", anvil0_TEST_counterfactual_account="null", usdc_e_contract="null", entrypoint_v07="null", kernel_v31_implementation="null")
res["registry_vs_deployed_sample"] = rv
mk = json.load(open("out/makers_registry.json"))
res["accounts_with_matched_onchain_orders_29"] = dict(orderbook_smart_account_nonnull=sum(1 for x in mk if x["orderbook_smart_account"]), dataapi_user_found=sum(1 for x in mk if x["dataapi_status"] == 200), dataapi_404=sum(1 for x in mk if x["dataapi_status"] == 404))
res["onchain_order_signature_recovery"] = dict(orders=52, txs=26, distinct_makers=29, signatureType3=52, sig_len_86=52, sig_prefix_0x01_validator_0x845A=52, nonce0=52, expiration0=52,
    registered_owner_check="18 of 18 makers checked: EIP-191(Kernel-wrapped digest) recovers to the validator-registered owner; raw-digest recovers to it in 0 of 18",
    userop_deploy_sigs="34 of 34 deploying UserOps recover to the initCode owner under EIP-191(userOpHash); 0 under raw")
res["bytecode_3223_vs_base"] = dict(factory="identical (989 bytes)", validator="identical (1819 bytes)", kernel_impl="22784 bytes; differs in 34 bytes = cached EIP-712 domain separator (32 B) + chainId (2 B: 0x0c97 vs 0x2105); both recomputed with cast")
res["population_derivation_check"] = dict(ownerRegistered_events=2627, salt0_create2_matches=2627, distinct_owners=2627, owners_with_two_accounts=0,
    windows="r0 blocks 140k-506k (capped 1000), m1 2.0-3.0M, m2 5.0-6.0M, m3 8.0-9.0M, m4 10.5-11.5M, r1 12.0M-12.6M (2025-10-28..2026-10-18; windowed sample, not a census)")
res["owner_activity_34_decoded"] = dict(base_nonce_gt0=sum(1 for x in act.values() if (x["base_nonce"] or 0) > 0), eth_nonce_gt0=sum(1 for x in act.values() if (x["eth_nonce"] or 0) > 0), measured=len(act))
res["owner_activity_r1_238"] = json.load(open("out/owner_activity_r1_summary.json"))
res["paymaster_global_selectors"] = dict(count=34, kernel_owner_change_selectors_matched=False, identified=["approve(address,uint256) 0x095ea7b3"], unidentified=33)
res["bundler_probe"] = dict(host="mainnet-bundler.xo.market", method="eth_supportedEntryPoints", http=200, result=["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"], auth="no key needed for this read method; sendUserOperation NOT tested")
res["v_byte_probe"] = "validator returns success for v=27/28 and reverts InvalidSignature (0x8baa579f) for v=0/1"
json.dump(res, open("out/fixture_results.json", "w"), indent=1)
