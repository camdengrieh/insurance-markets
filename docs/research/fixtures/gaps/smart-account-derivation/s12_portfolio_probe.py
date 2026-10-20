import json, sys
sys.path.insert(0, ".")
import xohttp
OWNER = "0xf8Cd9D7a289aBc491b62B7014ee13d1D5fe35416"
ACCT  = "0xC4531B7f421F1cC6Efd83e5F426Bfb39Ff4F7930"
ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
for label, a in (("first-account", ACCT), ("owner-EOA", OWNER), ("anvil0-TEST", ANVIL0)):
    code, j = xohttp.get("https://api-mainnet.xo.market/api/users/portfolio?user=%s" % a)
    s = json.dumps(j)
    print(label, code, s[:420])
