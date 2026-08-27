// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IntentGuardPolicy} from "../src/IntentGuardPolicy.sol";

interface Vm {
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract IntentGuardPolicyTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant APPROVED_RECIPIENT = address(0xBEEF);
    address internal constant ATTACKER = address(0xBAD);
    address internal constant UPDATED_RECIPIENT = address(0xCAFE);

    IntentGuardPolicy internal policy;

    function setUp() public {
        policy = new IntentGuardPolicy(APPROVED_RECIPIENT, 200, 10);
    }

    function testApprovedRecipientWithinLimitIsAllowed() public {
        require(policy.isTransactionAllowed(APPROVED_RECIPIENT, 150));
        require(policy.authorizeTransaction(APPROVED_RECIPIENT, 150));
        require(policy.transactionsInWindow() == 1);
    }

    function testUnapprovedRecipientIsRejected() public {
        require(!policy.isTransactionAllowed(ATTACKER, 150));
        vm.expectRevert(abi.encodeWithSelector(IntentGuardPolicy.RecipientNotApproved.selector));
        policy.authorizeTransaction(ATTACKER, 150);
    }

    function testAmountAboveMaximumIsRejected() public {
        require(!policy.isTransactionAllowed(APPROVED_RECIPIENT, 300));
        vm.expectRevert(abi.encodeWithSelector(IntentGuardPolicy.AmountExceedsLimit.selector));
        policy.authorizeTransaction(APPROVED_RECIPIENT, 300);
    }

    function testVelocityLimitIsEnforced() public {
        policy.updatePolicy(APPROVED_RECIPIENT, 200, 2);
        policy.authorizeTransaction(APPROVED_RECIPIENT, 100);
        policy.authorizeTransaction(APPROVED_RECIPIENT, 100);
        require(!policy.isTransactionAllowed(APPROVED_RECIPIENT, 100));
        vm.expectRevert(abi.encodeWithSelector(IntentGuardPolicy.VelocityLimitExceeded.selector));
        policy.authorizeTransaction(APPROVED_RECIPIENT, 100);
    }

    function testVelocityWindowResets() public {
        policy.updatePolicy(APPROVED_RECIPIENT, 200, 1);
        policy.authorizeTransaction(APPROVED_RECIPIENT, 100);
        vm.warp(block.timestamp + policy.WINDOW());
        require(policy.isTransactionAllowed(APPROVED_RECIPIENT, 100));
        require(policy.authorizeTransaction(APPROVED_RECIPIENT, 100));
    }

    function testUnauthorizedPolicyUpdateIsRejected() public {
        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(IntentGuardPolicy.Unauthorized.selector));
        policy.updatePolicy(UPDATED_RECIPIENT, 300, 20);
    }

    function testOwnerCanUpdatePolicy() public {
        policy.updatePolicy(UPDATED_RECIPIENT, 300, 20);
        require(policy.approvedRecipient() == UPDATED_RECIPIENT);
        require(policy.maxAmount() == 300);
        require(policy.velocityLimit() == 20);
        require(policy.isTransactionAllowed(UPDATED_RECIPIENT, 300));
    }
}
