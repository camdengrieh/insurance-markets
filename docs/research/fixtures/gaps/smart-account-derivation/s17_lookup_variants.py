import json, sys
sys.path.insert(0, ".")
import xohttp
cases = [
 ("anvil0-TEST counterfactual Kernel account (index 0)", "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d"),
 ("USDC.e token contract (a deployed non-Kernel contract)", "0x80c12230ce677e6f304027a14780Edd2A829ab0c"),
 ("EntryPoint v0.7 (deployed contract)", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"),
 ("Kernel v3.1 implementation (deployed Kernel code, never initialised as a user account)", "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D"),
]
for label, a in cases:
    code, j = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % a)
    print(label, code, j)
