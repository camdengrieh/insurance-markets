"""HMAC L2 canonical-string variants: compute the XO_SIGNATURE for one synthetic request under every variant the evidence leaves open.
Reproduces py-clob-client build_hmac_signature (copied logic) and compares with the other variants.
Synthetic inputs only: the secret is the OpenAPI *example* secret from the XO docs. Nothing here touches a network or a real credential."""
import base64, hashlib, hmac, json, itertools

SECRET_EXAMPLE = "dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ="  # from the XO OpenAPI example (decodes to ASCII text)
TS = "1792344796"

def poly_py(secret, ts, method, request_path, body=None):
    # logic copied from Polymarket/py-clob-client py_clob_client/signing/hmac.py
    key = base64.urlsafe_b64decode(secret)
    msg = str(ts) + str(method) + str(request_path)
    if body:
        msg += str(body).replace("'", '"')
    return base64.urlsafe_b64encode(hmac.new(key, bytes(msg, "utf-8"), hashlib.sha256).digest()).decode()

def variant(secret, ts, method, target, body, decode=True, keep_pad=True):
    key = base64.urlsafe_b64decode(secret) if decode else secret.encode()
    msg = (ts + method.upper() + target + body).encode()
    out = base64.urlsafe_b64encode(hmac.new(key, msg, hashlib.sha256).digest()).decode()
    return out if keep_pad else out.rstrip("=")

cases = [
    ("GET",    "/auth/api-keys",                 "/auth/api-keys",                 ""),
    ("GET",    "/orders?limit=1",                "/orders",                        ""),
    ("DELETE", "/order",                         "/order",                         json.dumps({"orderID": "42"}, separators=(",", ":"))),
]
res = []
for method, with_q, path_only, body in cases:
    row = {"method": method, "target_with_query": with_q, "target_path_only": path_only, "body": body, "variants": {}}
    for tgt_name, tgt in (("path-only", path_only), ("path-with-query", with_q)):
        for decode, pad in itertools.product((True, False), (True, False)):
            row["variants"][f"{tgt_name}|decode={decode}|pad={pad}"] = variant(SECRET_EXAMPLE, TS, method, tgt, body, decode, pad)
    row["polymarket_py_reference(path-only)"] = poly_py(SECRET_EXAMPLE, TS, method, path_only, body or None)
    row["py_equals_path_only_decode_pad"] = row["polymarket_py_reference(path-only)"] == row["variants"]["path-only|decode=True|pad=True"]
    row["variants_identical_when_no_query"] = (with_q == path_only) and len({v for k, v in row["variants"].items() if k.endswith("decode=True|pad=True")}) == 1
    res.append(row)
print(json.dumps(res, indent=1))
