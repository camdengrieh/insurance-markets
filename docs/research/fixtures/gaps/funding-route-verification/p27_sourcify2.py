import sys, json
sys.path.insert(0, '.')
import lib
for label, a in (("router impl", "0x5b3f32417d651d47ebaeb079e8cf28b479b0926a"), ("mailbox impl", "0xd58489d491e4b2f6872e3c0cc7b88dd479b0b159"), ("ism logic", "0xacc249b2de5792c8deab397eaf7c947ea37095e0")):
    st, t = lib.http("https://sourcify.dev/server/v2/contract/8453/" + a)
    print(label, st, t[:500])
