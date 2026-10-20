import sys, json, time
sys.path.insert(0, '.')
import lib
RPC = "https://rpc-mainnet-2.xo.market"
H = "https://explorer-mainnet.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
def show(label, r):
    print("%-40s %s" % (label, r if isinstance(r, str) else json.dumps(r)[:300]))
print("xo latest block", int(lib.rpc(RPC, "eth_blockNumber")["result"], 16))
for v in ["localDomain()", "nonce()", "latestDispatchedId()", "owner()", "defaultHook()", "requiredHook()", "defaultIsm()", "PACKAGE_VERSION()"]:
    show("xo mailbox." + v, lib.eth_call(RPC, MB, lib.selector(v)))
show("xo mailbox code bytes", (len(lib.rpc(RPC, "eth_getCode", [MB, "latest"])["result"]) - 2) // 2)
# explorer logs: test pagination
T_PID = lib.topic0("ProcessId(bytes32)")
st, j = lib.bs_logs(H, MB, T_PID, 0, 99999999, page=1, offset=3)
print("getLogs page1 offset3 ->", st, json.dumps(j)[:1400])
