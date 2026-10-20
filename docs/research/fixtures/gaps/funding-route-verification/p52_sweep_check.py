import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
USDCE = "0x80c12230ce677e6f304027a14780edd2a829ab0c"
T_TR = lib.topic0("Transfer(address,address,uint256)")
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
acct = DA[0]
latest = int(lib.rpc(XO, "eth_blockNumber")["result"], 16)
pad = "0x" + "0" * 24 + acct[2:]
tin = lib.rpc(XO, "eth_getLogs", [{"fromBlock": hex(latest - 99_000), "toBlock": hex(latest), "address": USDCE, "topics": [T_TR, None, pad]}]).get("result", [])
tout = lib.rpc(XO, "eth_getLogs", [{"fromBlock": hex(latest - 99_000), "toBlock": hex(latest), "address": USDCE, "topics": [T_TR, pad]}]).get("result", [])
def show(tag, rows):
    for r in rows:
        print(tag, "block", int(r["blockNumber"], 16), "from", "0x" + r["topics"][1][-40:][:8], "to", "0x" + r["topics"][2][-40:][:8], "amount_raw", int(r["data"], 16), "tx", r["transactionHash"][:12])
show("IN ", tin); show("OUT", tout)
bal = lib.eth_call(XO, USDCE, lib.selector("balanceOf(address)") + lib.enc_addr(acct))
print("current USDC.e balance of the deposit-recipient account:", int(bal, 16) if isinstance(bal, str) else bal)
