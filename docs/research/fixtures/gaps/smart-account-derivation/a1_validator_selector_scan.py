# Which function selectors exist in the deployed ECDSA validator bytecode (chain 3223 copy saved by s19)? Uses `cast sig` (local keccak only).
import json, subprocess
code = json.load(open("out/sc_validator.json"))["deployed_bytecode"][2:].lower()
sigs = ["onInstall(bytes)", "onUninstall(bytes)", "isModuleType(uint256)", "validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32)",
        "isValidSignatureWithSender(address,bytes32,bytes)", "validateSignatureWithData(bytes32,bytes,bytes)", "validateSignatureWithDataWithSender(address,bytes32,bytes,bytes)",
        "ecdsaValidatorStorage(address)", "transferOwnership(address)", "isInitialized(address)", "preCheck(address,uint256,bytes)", "postCheck(bytes)", "owner()", "setOwner(address)"]
for s in sigs:
    sel = subprocess.check_output(["cast", "sig", s]).decode().strip()
    print(sel, s, "PRESENT" if ("63" + sel[2:]) in code or sel[2:] in code else "absent")
