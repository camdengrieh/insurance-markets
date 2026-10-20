import sys, json, time, urllib.parse
sys.path.insert(0, '.')
import lib
H = "https://api.routescan.io/v2/network/mainnet/evm/8453/etherscan/api"
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
st, t = lib.http(H + "?" + urllib.parse.urlencode({"module": "proxy", "action": "eth_blockNumber"}))
print("blockNumber", st, t[:200])
if st == 200:
    p = {"module": "logs", "action": "getLogs", "address": MAILBOX, "topic0": T, "fromBlock": 43000000, "toBlock": 99999999, "page": 1, "offset": 5}
    st, t = lib.http(H + "?" + urllib.parse.urlencode(p))
    print("getLogs", st, t[:1500])
