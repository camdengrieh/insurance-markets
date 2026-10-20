// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PolicyPaymaster
 * @notice A paymaster with configurable sponsorship policies:
 *         1. Global daily limit for sponsored transactions per account
 *         2. Contract-based and selector-based policies
 *         3. Unlimited sponsorship for privileged addresses (admins)
 */
contract PolicyPaymaster is IPaymaster, Ownable, Pausable {
    IEntryPoint public immutable entryPoint;

    // ============ Constants ============
    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============ Storage ============

    /// @notice Global daily limit for sponsored transactions per account
    uint256 public dailyTxLimit;

    /// @notice Tracks daily usage per account: account => day => count
    mapping(address => mapping(uint256 => uint256)) public dailyUsage;

    /// @notice Addresses with unlimited sponsorship (no rate limiting, any contract/selector)
    mapping(address => bool) public unlimitedAddresses;

    /// @notice Whether a contract is fully whitelisted (all selectors allowed)
    mapping(address => bool) public whitelistedContracts;

    /// @notice Specific selector allowlist per contract: contract => selector => allowed
    mapping(address => mapping(bytes4 => bool)) public allowedSelectors;

    /// @notice Globally allowed selectors (sponsored on any target contract)
    mapping(bytes4 => bool) public globallyAllowedSelectors;

    // ============ Events ============

    event DailyTxLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event UnlimitedAddressSet(address indexed account, bool status);
    event ContractWhitelisted(address indexed target, bool status);
    event SelectorAllowed(address indexed target, bytes4 indexed selector, bool status);
    event GlobalSelectorAllowed(bytes4 indexed selector, bool status);
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // ============ Errors ============

    error DailyLimitExceeded(address account, uint256 currentUsage, uint256 limit);
    error ContractNotAllowed(address target);
    error SelectorNotAllowed(address target, bytes4 selector);
    error OnlyEntryPoint();
    error WithdrawFailed();

    // ============ Modifiers ============

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    // ============ Constructor ============

    constructor(IEntryPoint _entryPoint, uint256 _dailyTxLimit) Ownable(msg.sender) {
        entryPoint = _entryPoint;
        dailyTxLimit = _dailyTxLimit;
    }

    // ============ IPaymaster Implementation ============

    /**
     * @notice Validates a user operation for sponsorship
     * @dev Checks policies in order:
     *      1. If paused, reject all operations
     *      2. If sender is unlimited address, approve immediately
     *      3. Check contract/selector policies (validates ALL calls in batch)
     *      4. Check daily limit
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 /* maxCost */
    ) external onlyEntryPoint override returns (bytes memory context, uint256 validationData) {
        // If paused, reject all operations
        if (paused()) {
            return ("", 1); // SIG_VALIDATION_FAILED
        }

        address sender = userOp.sender;

        // 1. Unlimited addresses bypass all checks
        if (unlimitedAddresses[sender]) {
            return (abi.encode(sender, false), 0); // false = don't increment usage
        }

        // 2. Validate all calls in the calldata against policies
        if (!_validateCallData(userOp.callData)) {
            // Return validation data with SIG_VALIDATION_FAILED flag (1)
            return ("", 1);
        }

        // 3. Check daily limit
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 currentUsage = dailyUsage[sender][currentDay];

        if (currentUsage >= dailyTxLimit) {
            // Return validation data with SIG_VALIDATION_FAILED flag (1)
            return ("", 1);
        }

        // Return context with sender and flag to increment usage in postOp
        return (abi.encode(sender, true), 0); // true = increment usage
    }

    /**
     * @notice Called after user operation execution
     * @dev Increments daily usage counter if needed
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256, /* actualGasCost */
        uint256 /* actualUserOpFeePerGas */
    ) external onlyEntryPoint override {
        // Only increment on successful execution or postOp revert
        if (mode == PostOpMode.opReverted) {
            return;
        }

        if (context.length > 0) {
            (address sender, bool shouldIncrement) = abi.decode(context, (address, bool));
            if (shouldIncrement) {
                uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
                dailyUsage[sender][currentDay]++;
            }
        }
    }

    // ============ Internal Functions ============

    /// @notice ERC-7579 execute selector: execute(bytes32 mode, bytes calldata executionCalldata)
    bytes4 internal constant ERC7579_EXECUTE_SELECTOR = 0xe9ae5c53;
    
    /// @notice ERC-7579 mode type mask (first byte)
    bytes1 internal constant ERC7579_MODE_SINGLE = 0x00;
    bytes1 internal constant ERC7579_MODE_BATCH = 0x01;

    /**
     * @notice Validates all calls in the user operation calldata against policies
     * @dev Handles multiple account abstraction patterns:
     *      - ERC-7579: execute(bytes32,bytes) - single and batch modes
     *      - Simple: execute(address,uint256,bytes)
     *      - Safe-style: execute(address,uint256,bytes,uint8)
     * @return True if all calls are allowed by policy
     */
    function _validateCallData(bytes calldata callData) internal view returns (bool) {
        if (callData.length < 4) {
            return false;
        }

        bytes4 accountSelector = bytes4(callData[:4]);

        // ERC-7579: execute(bytes32 mode, bytes calldata executionCalldata)
        // Selector: 0xe9ae5c53
        if (accountSelector == ERC7579_EXECUTE_SELECTOR) {
            return _validateERC7579Execute(callData[4:]);
        }

        // Common execute selector: execute(address dest, uint256 value, bytes calldata func)
        // Selector: 0xb61d27f6
        if (accountSelector == bytes4(0xb61d27f6)) {
            (address target, bytes4 selector) = _parseSimpleExecute(callData[4:]);
            return _isAllowed(target, selector);
        }

        // execute(address dest, uint256 value, bytes calldata func, uint8 operation)
        // Used by some Safe-style accounts
        // Selector: 0x51945447
        if (accountSelector == bytes4(0x51945447)) {
            (address target, bytes4 selector) = _parseSafeExecute(callData[4:]);
            return _isAllowed(target, selector);
        }

        // Fallback: treat the userOp as calling the account itself
        return _isAllowed(address(0), accountSelector);
    }

    /**
     * @notice Validates ERC-7579 execute calldata
     * @dev Supports single and batch execution modes
     */
    function _validateERC7579Execute(bytes calldata data) internal view returns (bool) {
        if (data.length < 64) return false; // Need at least mode (32) + offset (32)
        
        // First 32 bytes is the mode
        bytes32 mode = bytes32(data[:32]);
        bytes1 modeType = bytes1(mode);
        
        // Get the executionCalldata (dynamic bytes)
        // Offset is at bytes 32-64, then length, then data
        uint256 offset = uint256(bytes32(data[32:64]));
        if (data.length < offset + 32) return false;
        
        uint256 execDataLength = uint256(bytes32(data[offset:offset + 32]));
        if (data.length < offset + 32 + execDataLength) return false;
        
        bytes calldata execData = data[offset + 32:offset + 32 + execDataLength];
        
        if (modeType == ERC7579_MODE_SINGLE) {
            // Single execution: abi.encodePacked(target, value, calldata)
            // target: 20 bytes, value: 32 bytes, calldata: rest
            return _validateERC7579Single(execData);
        } else if (modeType == ERC7579_MODE_BATCH) {
            // Batch execution: abi.encode(Execution[])
            return _validateERC7579Batch(execData);
        }
        
        // Unknown mode type - reject
        return false;
    }

    /**
     * @notice Validates a single ERC-7579 execution
     * @dev Format: abi.encodePacked(target, value, calldata)
     */
    function _validateERC7579Single(bytes calldata execData) internal view returns (bool) {
        if (execData.length < 52) return false; // 20 (target) + 32 (value) minimum
        
        address target = address(bytes20(execData[:20]));
        // value is at 20:52 (32 bytes) - we don't need it for policy check
        
        bytes4 selector = bytes4(0);
        if (execData.length >= 56) { // Has at least 4 bytes of calldata
            selector = bytes4(execData[52:56]);
        }
        
        return _isAllowed(target, selector);
    }

    /**
     * @notice Validates a batch of ERC-7579 executions
     * @dev Format: abi.encode(Execution[]) where Execution = (address target, uint256 value, bytes calldata)
     *      ALL executions must be allowed for the batch to pass
     */
    function _validateERC7579Batch(bytes calldata execData) internal view returns (bool) {
        if (execData.length < 64) return false;
        
        // First 32 bytes is offset to array, next 32 is array length
        uint256 arrayOffset = uint256(bytes32(execData[:32]));
        if (execData.length < arrayOffset + 32) return false;
        
        uint256 arrayLength = uint256(bytes32(execData[arrayOffset:arrayOffset + 32]));
        if (arrayLength == 0) return false;
        
        // Each array element is an offset to the Execution struct
        uint256 elementsStart = arrayOffset + 32;
        
        for (uint256 i = 0; i < arrayLength; i++) {
            // Get offset to this Execution struct (relative to array start)
            uint256 elementOffsetPos = elementsStart + (i * 32);
            if (execData.length < elementOffsetPos + 32) return false;
            
            uint256 elementOffset = uint256(bytes32(execData[elementOffsetPos:elementOffsetPos + 32]));
            uint256 structStart = elementsStart + elementOffset;
            
            if (execData.length < structStart + 96) return false; // target(32) + value(32) + calldata offset(32)
            
            // Parse Execution struct: (address target, uint256 value, bytes calldata)
            address target = address(uint160(uint256(bytes32(execData[structStart:structStart + 32]))));
            // value at structStart + 32 - not needed
            uint256 calldataOffset = uint256(bytes32(execData[structStart + 64:structStart + 96]));
            
            bytes4 selector = bytes4(0);
            uint256 calldataStart = structStart + calldataOffset;
            if (execData.length >= calldataStart + 32) {
                uint256 calldataLength = uint256(bytes32(execData[calldataStart:calldataStart + 32]));
                if (calldataLength >= 4 && execData.length >= calldataStart + 36) {
                    selector = bytes4(execData[calldataStart + 32:calldataStart + 36]);
                }
            }
            
            // ALL calls must be allowed
            if (!_isAllowed(target, selector)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * @notice Parses simple execute(address,uint256,bytes) format
     */
    function _parseSimpleExecute(bytes calldata data) internal pure returns (address target, bytes4 selector) {
        if (data.length >= 32) {
            target = address(uint160(uint256(bytes32(data[:32]))));
            if (data.length >= 96) {
                uint256 dataOffset = uint256(bytes32(data[64:96]));
                uint256 dataStart = dataOffset + 32;
                if (data.length >= dataStart + 4) {
                    selector = bytes4(data[dataStart:dataStart + 4]);
                }
            }
        }
    }

    /**
     * @notice Parses Safe-style execute(address,uint256,bytes,uint8) format
     */
    function _parseSafeExecute(bytes calldata data) internal pure returns (address target, bytes4 selector) {
        if (data.length >= 32) {
            target = address(uint160(uint256(bytes32(data[:32]))));
            if (data.length >= 128) {
                uint256 dataOffset = uint256(bytes32(data[64:96]));
                uint256 dataStart = dataOffset + 32;
                if (data.length >= dataStart + 4) {
                    selector = bytes4(data[dataStart:dataStart + 4]);
                }
            }
        }
    }

    /**
     * @notice Checks if a target contract and selector combination is allowed
     */
    function _isAllowed(address target, bytes4 selector) internal view returns (bool) {
        // Check globally allowed selectors first (any target)
        if (globallyAllowedSelectors[selector]) {
            return true;
        }

        // If contract is fully whitelisted, allow any selector
        if (whitelistedContracts[target]) {
            return true;
        }

        // Check specific selector allowlist for this contract
        if (allowedSelectors[target][selector]) {
            return true;
        }

        return false;
    }

    // ============ Admin Functions ============

    /**
     * @notice Pauses all paymaster operations
     * @dev When paused, all user operations will be rejected
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the paymaster
     * @dev Restores normal operation
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Sets the global daily transaction limit per account
     */
    function setDailyTxLimit(uint256 _dailyTxLimit) external onlyOwner {
        emit DailyTxLimitUpdated(dailyTxLimit, _dailyTxLimit);
        dailyTxLimit = _dailyTxLimit;
    }

    /**
     * @notice Sets unlimited sponsorship status for an address
     */
    function setUnlimitedAddress(address account, bool status) external onlyOwner {
        unlimitedAddresses[account] = status;
        emit UnlimitedAddressSet(account, status);
    }

    /**
     * @notice Batch set unlimited addresses
     */
    function setUnlimitedAddresses(address[] calldata accounts, bool status) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            unlimitedAddresses[accounts[i]] = status;
            emit UnlimitedAddressSet(accounts[i], status);
        }
    }

    /**
     * @notice Whitelists a contract (allows all selectors)
     */
    function setWhitelistedContract(address target, bool status) external onlyOwner {
        whitelistedContracts[target] = status;
        emit ContractWhitelisted(target, status);
    }

    /**
     * @notice Batch whitelist contracts
     */
    function setWhitelistedContracts(address[] calldata targets, bool status) external onlyOwner {
        for (uint256 i = 0; i < targets.length; i++) {
            whitelistedContracts[targets[i]] = status;
            emit ContractWhitelisted(targets[i], status);
        }
    }

    /**
     * @notice Sets allowed status for a specific selector on a contract
     */
    function setAllowedSelector(address target, bytes4 selector, bool status) external onlyOwner {
        allowedSelectors[target][selector] = status;
        emit SelectorAllowed(target, selector, status);
    }

    /**
     * @notice Batch set allowed selectors for a contract
     */
    function setAllowedSelectors(
        address target,
        bytes4[] calldata selectors,
        bool status
    ) external onlyOwner {
        for (uint256 i = 0; i < selectors.length; i++) {
            allowedSelectors[target][selectors[i]] = status;
            emit SelectorAllowed(target, selectors[i], status);
        }
    }

    /**
     * @notice Batch set allowed selectors for multiple contracts
     */
    function setAllowedSelectorsMultiple(
        address[] calldata targets,
        bytes4[][] calldata selectors,
        bool status
    ) external onlyOwner {
        require(targets.length == selectors.length, "Length mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            for (uint256 j = 0; j < selectors[i].length; j++) {
                allowedSelectors[targets[i]][selectors[i][j]] = status;
                emit SelectorAllowed(targets[i], selectors[i][j], status);
            }
        }
    }

    /**
     * @notice Sets a globally allowed selector (sponsored on any target contract)
     */
    function setGloballyAllowedSelector(bytes4 selector, bool status) external onlyOwner {
        globallyAllowedSelectors[selector] = status;
        emit GlobalSelectorAllowed(selector, status);
    }

    /**
     * @notice Batch set globally allowed selectors
     */
    function setGloballyAllowedSelectors(bytes4[] calldata selectors, bool status) external onlyOwner {
        for (uint256 i = 0; i < selectors.length; i++) {
            globallyAllowedSelectors[selectors[i]] = status;
            emit GlobalSelectorAllowed(selectors[i], status);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Gets the current daily usage for an account
     */
    function getDailyUsage(address account) external view returns (uint256) {
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        return dailyUsage[account][currentDay];
    }

    /**
     * @notice Gets remaining sponsored transactions for an account today
     */
    function getRemainingDailyTxs(address account) external view returns (uint256) {
        if (unlimitedAddresses[account]) {
            return type(uint256).max;
        }
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 used = dailyUsage[account][currentDay];
        if (used >= dailyTxLimit) {
            return 0;
        }
        return dailyTxLimit - used;
    }

    /**
     * @notice Checks if a target/selector combination would be allowed for an account
     */
    function checkPolicy(
        address account,
        address target,
        bytes4 selector
    ) external view returns (bool allowed, string memory reason) {
        if (unlimitedAddresses[account]) {
            return (true, "Unlimited address");
        }

        if (!_isAllowed(target, selector)) {
            return (false, "Contract/selector not allowed");
        }

        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        if (dailyUsage[account][currentDay] >= dailyTxLimit) {
            return (false, "Daily limit exceeded");
        }

        // Return specific reason for why it's allowed
        if (globallyAllowedSelectors[selector]) {
            return (true, "Globally allowed selector");
        }
        if (whitelistedContracts[target]) {
            return (true, "Whitelisted contract");
        }
        return (true, "Allowed selector on contract");
    }

    // ============ Deposit Management ============

    /**
     * @notice Deposits ETH into the EntryPoint for this paymaster
     */
    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraws ETH from the EntryPoint deposit
     */
    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
        emit Withdrawn(to, amount);
    }

    /**
     * @notice Gets the current deposit balance in the EntryPoint
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @notice Allows the contract to receive ETH directly
     */
    receive() external payable {
        // Automatically deposit to EntryPoint
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }
}
