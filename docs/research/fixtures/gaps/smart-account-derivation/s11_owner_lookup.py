import json, sys
sys.path.insert(0, ".")
import xohttp
OWNER = "0xf8Cd9D7a289aBc491b62B7014ee13d1D5fe35416"   # decoded owner of first observed account
ACCT  = "0xC4531B7f421F1cC6Efd83e5F426Bfb39Ff4F7930"
ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"  # public Anvil/Hardhat account 0 (well-known test key, label: TEST)
for label, a in (("owner-EOA-of-first-account", OWNER), ("first-account", ACCT), ("anvil0-TEST", ANVIL0)):
    code, j = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % a)
    print(label, code, j)
