import json, sys
sys.path.insert(0, ".")
import xohttp
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T0 = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d"
a = sys.argv[1]
url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest"
       "&address=%s&topic0=%s&topic0_2_opr=and&topic2=%s" % (EP, T0, "0x"+"0"*24+a[2:].lower()))
code, j = xohttp.get(url)
print(sys.argv[1], code, j.get("message"), len(j.get("result") or []))
