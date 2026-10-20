import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
MGR = "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307".lower()
T = lib.topic0("MarketCreationFeeCharged(bytes32,address,address,uint256)")
latest = int(lib.rpc(XO, "eth_blockNumber")["result"], 16)
j = lib.rpc(XO, "eth_getLogs", [{"fromBlock": hex(latest - 99_000), "toBlock": hex(latest), "address": MGR, "topics": [T]}])
logs = j.get("result", [])
print("fee events in last 99k blocks:", len(logs), j.get("error"))
if logs:
    creator = "0x" + logs[-1]["topics"][2][-40:]
    c = lib.rpc(XO, "eth_getCode", [creator, "latest"])["result"]
    b = bytes.fromhex(c[2:])
    print("creator account code bytes", len(b), "codehash 0x" + lib.keccak256(b).hex()[:16], "head", c[:70])
    print("same 217-byte proxy as deposit recipients:", ("0x" + lib.keccak256(b).hex()[:16]) == "0xbab6360a5a6ccb36")
    r = lib.eth_call(XO, creator, lib.selector("eip712Domain()"))
    print("eip712Domain() ->", r if not isinstance(r, str) else "OK len %d" % len(r))
