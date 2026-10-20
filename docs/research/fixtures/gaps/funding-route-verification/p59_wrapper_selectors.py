"""Offline: scan data/wrapper_runtime.hex (code of 0x5d1d...f9ba9 saved by the scan below) for PUSH4 selectors followed by EQ; then look them up."""
import sys, json
sys.path.insert(0, '.')
import lib
c = open("data/wrapper_runtime.hex").read().strip()
b = bytes.fromhex(c[2:])
sels = []
for i in range(len(b) - 6):
    if b[i] == 0x63 and b[i + 5] in (0x14, 0x81, 0x80) and 0x14 in b[i + 5:i + 9]:
        sels.append("0x" + b[i + 1:i + 5].hex())
sels = list(dict.fromkeys(sels))
print(len(sels), "selectors")
st, t = lib.http("https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=" + ",".join(sels[:40]))
j = json.loads(t)["result"]["function"]
for k, v in j.items():
    print(k, [x["name"] for x in v] if v else None)
