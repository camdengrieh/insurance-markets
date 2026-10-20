import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
USDCE = "0x80c12230ce677e6f304027a14780edd2a829ab0c"
T_TR = lib.topic0("Transfer(address,address,uint256)")
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
acct = DA[0]
pad = "0x" + "0" * 24 + acct[2:]
tout = lib.rpc(XO, "eth_getLogs", [{"fromBlock": hex(12584670), "toBlock": hex(12584690), "address": USDCE, "topics": [T_TR, pad]}]).get("result", [])
tgt = "0x" + tout[0]["topics"][2][-40:]
c = lib.rpc(XO, "eth_getCode", [tgt, "latest"])["result"]; b = bytes.fromhex(c[2:])
print("sweep target code bytes", len(b), "codehash 0x" + lib.keccak256(b).hex()[:16], "head", c[:60])
r = lib.eth_call(XO, tgt, lib.selector("eip712Domain()"))
print("sweep target eip712Domain() ->", ("OK len %d" % len(r)) if isinstance(r, str) else r)
if isinstance(r, str) and len(r) > 200:
    w = lib.dec_words(r)
    def s_at(k):
        off = int(w[k], 16) // 32; ln = int(w[off], 16)
        return bytes.fromhex("".join(w[off + 1:off + 1 + (ln + 31) // 32]))[:ln].decode("utf-8", "replace")
    print("   name", s_at(1), "version", s_at(2), "chainId", int(w[3], 16), "verifyingContract==target", lib.dec_addr(w[4]) == tgt)
