"""Decode an explorer tx JSON (EntryPoint handleOps) -> UserOps -> Kernel execute -> batch calls. Offline ABI decode via cast.
Output per UserOp: sender-tag, nonce key, #calls, each call (target, value, selector, short args), paymaster address, gas fields."""
import sys, json, subprocess, os
SEL = {"0x095ea7b3": "approve(address,uint256)", "0x7f54a7a2": "createConvictionMarket(uint40,uint40,address,string)",
       "0xa22cb465": "setApprovalForAll(address,bool)", "0xa9059cbb": "transfer(address,uint256)",
       "0x1de5facd": "respondToUpdateRequest(bytes32,bool)", "0xbdb83289": "cancelMarket(bytes32)"}
def cast(*a): return subprocess.check_output(["cast", *a], text=True).strip()
def decode_tx(d):
    raw = d["raw_input"]
    out = json.loads(cast("calldata-decode", "--json", "handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[],address)", raw))
    res = []
    for op in out[0]:
        sender, nonce, initcode, calldata, agl, pvg, gfees, pmd, sig = op
        r = {"nonce_hex": hex(int(nonce)), "initCode_len": (len(initcode) - 2) // 2, "sig_len": (len(sig) - 2) // 2,
             "paymaster": ("0x" + pmd[2:42]) if len(pmd) >= 42 else None, "pmd_len": (len(pmd) - 2) // 2,
             "verificationGasLimit": int(agl[2:34], 16), "callGasLimit": int(agl[34:], 16), "preVerificationGas": int(pvg),
             "maxPriorityFee": int(gfees[2:34], 16), "maxFeePerGas": int(gfees[34:], 16)}
        sel = calldata[:10]
        r["account_selector"] = sel
        if sel == "0xe9ae5c53":
            mode = "0x" + calldata[10:74]
            r["exec_mode"] = mode
            body = "0x" + calldata[10 + 64 * 1 + 64 * 0:]
            # execute(bytes32 mode, bytes executionCalldata): decode
            m, ec = json.loads(cast("abi-decode", "--json", "f(bytes32,bytes)", "0x" + calldata[10:]) if False else cast("abi-decode", "--input", "--json", "f(bytes32,bytes)", "0x" + calldata[10:]))
            calls = []
            if m.startswith("0x01"):
                arr = json.loads(cast("abi-decode", "--input", "--json", "f((address,uint256,bytes)[])", ec))[0]
                for t, v, cd in arr:
                    calls.append({"target": t, "value": int(v), "selector": cd[:10], "sig": SEL.get(cd[:10]), "calldata": cd})
            else:
                t = "0x" + ec[2:42]; v = int(ec[42:106], 16); cd = "0x" + ec[106:]
                calls.append({"target": t, "value": v, "selector": cd[:10], "sig": SEL.get(cd[:10]), "calldata": cd})
            r["calls"] = calls
        res.append(r)
    return res
if __name__ == "__main__":
    d = json.load(open(sys.argv[1]))
    for r in decode_tx(d):
        print(json.dumps({k: v for k, v in r.items() if k != "calls"}))
        for c in r.get("calls", []):
            print("  call", c["target"], c["value"], c["selector"], c["sig"], c["calldata"][:140])
