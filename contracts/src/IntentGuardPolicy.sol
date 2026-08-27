// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IntentGuardPolicy {
    uint256 public constant WINDOW = 1 hours;

    address public immutable owner;
    address public approvedRecipient;
    uint256 public maxAmount;
    uint256 public velocityLimit;
    uint256 public windowStart;
    uint256 public transactionsInWindow;

    error Unauthorized();
    error InvalidPolicy();
    error RecipientNotApproved();
    error AmountExceedsLimit();
    error VelocityLimitExceeded();

    event PolicyUpdated(address indexed approvedRecipient, uint256 maxAmount, uint256 velocityLimit);
    event TransactionAuthorized(address indexed caller, address indexed recipient, uint256 amount);

    constructor(address initialApprovedRecipient, uint256 initialMaxAmount, uint256 initialVelocityLimit) {
        owner = msg.sender;
        _setPolicy(initialApprovedRecipient, initialMaxAmount, initialVelocityLimit);
        windowStart = block.timestamp;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function updatePolicy(address newApprovedRecipient, uint256 newMaxAmount, uint256 newVelocityLimit)
        external
        onlyOwner
    {
        _setPolicy(newApprovedRecipient, newMaxAmount, newVelocityLimit);
        windowStart = block.timestamp;
        transactionsInWindow = 0;
        emit PolicyUpdated(newApprovedRecipient, newMaxAmount, newVelocityLimit);
    }

    function isTransactionAllowed(address recipient, uint256 amount) public view returns (bool) {
        if (recipient != approvedRecipient || amount > maxAmount) return false;
        uint256 currentCount = block.timestamp >= windowStart + WINDOW ? 0 : transactionsInWindow;
        return currentCount < velocityLimit;
    }

    function authorizeTransaction(address recipient, uint256 amount) external returns (bool) {
        _resetWindowIfNeeded();
        if (recipient != approvedRecipient) revert RecipientNotApproved();
        if (amount > maxAmount) revert AmountExceedsLimit();
        if (transactionsInWindow >= velocityLimit) revert VelocityLimitExceeded();
        transactionsInWindow += 1;
        emit TransactionAuthorized(msg.sender, recipient, amount);
        return true;
    }

    function _setPolicy(address newApprovedRecipient, uint256 newMaxAmount, uint256 newVelocityLimit) internal {
        if (newApprovedRecipient == address(0) || newMaxAmount == 0 || newVelocityLimit == 0) revert InvalidPolicy();
        approvedRecipient = newApprovedRecipient;
        maxAmount = newMaxAmount;
        velocityLimit = newVelocityLimit;
    }

    function _resetWindowIfNeeded() internal {
        if (block.timestamp >= windowStart + WINDOW) {
            windowStart = block.timestamp;
            transactionsInWindow = 0;
        }
    }
}
