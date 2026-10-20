#!/bin/sh
# Recompute Kernel EIP-712 domain separator for (chainId, verifyingContract=Kernel implementation) with cast.
IMPL=0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D
TH=$(cast keccak "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
NH=$(cast keccak "Kernel"); VH=$(cast keccak "0.3.1")
for CID in 3223 8453; do
  echo "chainId $CID: $(cast keccak $(cast abi-encode 'f(bytes32,bytes32,bytes32,uint256,address)' $TH $NH $VH $CID $IMPL))"
done
