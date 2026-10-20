#!/bin/sh
# Hyperlane registry + GitHub code search (read-only; uses the gh CLI, output stays in a local dir).
# Usage: sh registry_search.sh <outdir>
OUT="${1:-reg}"; mkdir -p "$OUT"
gh api repos/hyperlane-xyz/hyperlane-registry/contents/deployments/warp_routes -q '.[].name' > "$OUT/warp_route_dirs.txt"
gh api repos/hyperlane-xyz/hyperlane-registry/contents/deployments/warp_routes/XO -q '.[].name' > "$OUT/xo_dir.txt"
gh api -H "Accept: application/vnd.github.raw" repos/hyperlane-xyz/hyperlane-registry/contents/deployments/warp_routes/warpRouteConfigs.yaml > "$OUT/warpRouteConfigs.yaml"
gh api repos/hyperlane-xyz/hyperlane-registry/contents/chains -q '.[].name' > "$OUT/chains.txt"
gh api -H "Accept: application/vnd.github.raw" repos/hyperlane-xyz/hyperlane-registry/contents/chains/metadata.yaml > "$OUT/metadata.yaml"
echo "chains listed: $(wc -l < "$OUT/chains.txt")"
echo "chain names matching xo/market:"; grep -i -n 'xo\|market' "$OUT/chains.txt"
echo "metadata hits for chainId/domainId 3223:"; grep -n -B3 -A3 'chainId: 3223$\|domainId: 3223$' "$OUT/metadata.yaml"
echo "route configs mentioning the router/route/token addresses:"; grep -n -i '54716a535c3b5616e3f0d4d5005fc4bb660cdf5f\|9090463546d725f6ece5d1a4b27beb929d5d1983\|80c12230ce677e6f304027a14780edd2a829ab0c' "$OUT/warpRouteConfigs.yaml"
for q in 54716a535c3b5616e3f0d4d5005fc4bb660cdf5f 9090463546d725F6eCE5D1A4B27beB929D5D1983 80c12230ce677e6f304027a14780Edd2A829ab0c; do
  echo "== code search: $q"
  gh api -X GET search/code -f q="$q" -f per_page=10 -q '.total_count, (.items[]? | .repository.full_name+" "+.path)'
  sleep 3
done
