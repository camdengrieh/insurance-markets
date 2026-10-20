import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://mainnet.base.org"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
for name, slot in (("impl", IMPL_SLOT), ("admin", ADMIN_SLOT)):
    j = lib.rpc(RPC, "eth_getStorageAt", [ROUTER, slot, "latest"])
    print(name, j.get("result"))
views = ["token()", "wrappedToken()", "mailbox()", "localDomain()", "domains()", "owner()",
         "interchainSecurityModule()", "hook()", "feeRecipient()", "feeHook()", "feeToken()",
         "PACKAGE_VERSION()", "name()", "symbol()", "decimals()", "totalSupply()", "scale()",
         "interchainGasPaymaster()", "paused()", "version()", "implementation()"]
for v in views:
    r = lib.eth_call(RPC, ROUTER, lib.selector(v))
    print("%-30s %s" % (v, r if isinstance(r, str) else json.dumps(r)[:200]))
