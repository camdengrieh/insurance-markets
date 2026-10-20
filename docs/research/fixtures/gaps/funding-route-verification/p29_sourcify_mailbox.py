import sys, json
sys.path.insert(0, '.')
import lib
for label, a in (("mailbox impl", "0xd58489d491e4b2f6872e3c0cc7b88dd479b0b159"), ("merkle hook", "0xf9a84a5e63e7335d44e132775b1244462e08e449")):
    st, t = lib.http("https://sourcify.dev/server/v2/contract/8453/" + a + "?fields=all")
    print(label, st, len(t))
    if st == 200:
        j = json.loads(t)
        json.dump(j, open("data/sourcify_%s.json" % label.replace(" ", "_"), "w"))
        print("  name", j["compilation"]["fullyQualifiedName"], j["match"], j["verifiedAt"])
    else:
        print("  ", t[:200])
