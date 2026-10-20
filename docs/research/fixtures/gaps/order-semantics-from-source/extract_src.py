import json, os, sys
inp, outdir = sys.argv[1], sys.argv[2]
d = json.load(open(inp))
print({k: (v if not isinstance(v,(list,dict,str)) or (isinstance(v,str) and len(v)<120) else type(v).__name__) for k,v in d.items()})
os.makedirs(outdir, exist_ok=True)
files = [{"file_path": d.get("file_path"), "source_code": d.get("source_code")}] + d.get("additional_sources", [])
for f in files:
    p = f["file_path"].lstrip("/")
    full = os.path.join(outdir, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w").write(f["source_code"])
    print(p, len(f["source_code"]))
