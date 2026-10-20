import sys, json
sys.path.insert(0, '.')
import lib
URL = "https://base.drpc.org"
rows = json.load(open("data/base_tx_sample.json"))
T_TR = lib.topic0("Transfer(address,address,uint256)"); T_SENT = lib.topic0("SentTransferRemote(uint32,bytes32,uint256)")
accts = []
for r in (rows[0], rows[-1]):
    rc = lib.rpc(URL, "eth_getTransactionReceipt", [r["tx"]])["result"]
    first = [l for l in rc["logs"] if l["topics"][0] == T_TR][-1]       # the Transfer into the router
    acct = "0x" + first["topics"][1][-40:]
    recip = [l for l in rc["logs"] if l["topics"][0] == T_SENT][0]["topics"][2]
    accts.append((acct, recip))
json.dump(accts, open("data/deposit_accounts.json", "w"))   # third-party sample accounts are kept out of this file
codes = []
for acct, recip in accts:
    c = lib.rpc(URL, "eth_getCode", [acct, "latest"])["result"]
    codes.append(c)
    b = bytes.fromhex(c[2:])
    print("deposit account", acct[:10], "code bytes", len(b), "codehash 0x" + lib.keccak256(b).hex()[:16])
    # embedded 20-byte pushes
    i = 0; pushes = []
    while i < len(b):
        op = b[i]
        if op == 0x73: pushes.append("0x" + b[i + 1:i + 21].hex()); i += 21
        elif 0x60 <= op <= 0x7f: i += op - 0x5f + 1
        else: i += 1
    print("   PUSH20 constants:", pushes)
    print("   recipient (XO) bytes32:", recip, " appears in account code:", recip[26:].lower() in c.lower())
    print("   tail 64 bytes:", b[-64:].hex())
print("same code:", codes[0] == codes[1])
