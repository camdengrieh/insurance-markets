# Match the paymaster's currently allowed global selectors (s37) against a candidate list of Kernel / ERC-20 / CT selectors.
import json, subprocess
allowed = set(json.load(open("out/pm_global_selectors.json")))
cands = ["approve(address,uint256)", "transfer(address,uint256)", "setApprovalForAll(address,bool)", "installModule(uint256,address,bytes)", "uninstallModule(uint256,address,bytes)",
 "installValidations(bytes21[],(uint32,address)[],bytes[],bytes[])", "uninstallValidation(bytes21,bytes,bytes)", "changeRootValidator(bytes21,address,bytes,bytes)",
 "invalidateNonce(uint32)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)", "execute(bytes32,bytes)", "executeBatch((address,uint256,bytes)[])",
 "executeFromExecutor(bytes32,bytes)", "grantAccess(bytes21,bytes4,bool)", "transferOwnership(address)", "redeemPositions(address,bytes32,bytes32,uint256[])",
 "splitPosition(address,bytes32,bytes32,uint256[],uint256)", "mergePositions(address,bytes32,bytes32,uint256[],uint256)",
 "safeTransferFrom(address,address,uint256,uint256,bytes)", "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)", "incrementNonce()", "withdraw(uint256)", "deposit()"]
hits = {}
for s in cands:
    sel = subprocess.check_output(["cast", "sig", s]).decode().strip()
    if sel in allowed: hits[sel] = s
print(len(allowed), "global selectors allowed; identified:", hits, "| unidentified:", len(allowed - set(hits)))
