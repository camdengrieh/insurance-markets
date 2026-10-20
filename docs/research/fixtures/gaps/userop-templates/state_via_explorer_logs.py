"""Keyless state reads via Blockscout etherscan-style getLogs (GET only):
   (1) Enable-Trading state of an account = ApprovalForAll(account, CTF Exchange, true) on Conditional Tokens + Approval(account, CTF Exchange, value) on USDC.e
   (2) payoutDenominator>0 <=> ConditionResolution(conditionId, ...) was emitted by Conditional Tokens (reportPayouts)."""
import sys, json, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x
B = "https://explorer-mainnet.xo.market"
CTF = "0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909"; USDC = "0x80c12230ce677e6f304027a14780Edd2A829ab0c"; EXCH = "0x4bC5E872256D12E6017dfe466E04c867DC761B77"
def pad(a): return "0x" + a.lower()[2:].rjust(64, "0")
def k(sig): return subprocess.run(["cast", "keccak", sig], capture_output=True, text=True).stdout.strip()
mode = sys.argv[1]
if mode == "trading":
    acct = sys.argv[2]
    for name, addr, t0 in [("CTF.ApprovalForAll", CTF, k("ApprovalForAll(address,address,bool)")), ("USDC.e.Approval", USDC, k("Approval(address,address,uint256)"))]:
        q = "%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic1=%s&topic2=%s&topic0_1_opr=and&topic0_2_opr=and&topic1_2_opr=and" % (B, addr, t0, pad(acct), pad(EXCH))
        r = x.get_json(q); res = r.get("result") if isinstance(r.get("result"), list) else []
        last = res[-1] if res else None
        print(name, "events", len(res), "latest data", last["data"][:66] + ".." if last else None, "block", int(last["blockNumber"], 16) if last else None)
elif mode == "resolved":
    cond = sys.argv[2]
    t0 = k("ConditionResolution(bytes32,address,bytes32,uint256,uint256[])")
    q = "%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic1=%s&topic0_1_opr=and" % (B, CTF, t0, cond)
    r = x.get_json(q); res = r.get("result") if isinstance(r.get("result"), list) else []
    print("ConditionResolution events for", cond[:14], ":", len(res), "->", "payoutDenominator>0 (redeemable)" if res else "unresolved")
    if res: print(" payout data (outcomeSlotCount, payoutNumerators[]):", res[-1]["data"][:2 + 64 * 5])
