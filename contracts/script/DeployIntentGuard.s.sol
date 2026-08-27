// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IntentGuardPolicy} from "../src/IntentGuardPolicy.sol";

interface Vm {
    function envAddress(string calldata key) external returns (address);
    function envUint(string calldata key) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployIntentGuard {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (IntentGuardPolicy deployedPolicy) {
        address approvedRecipient = vm.envAddress("APPROVED_RECIPIENT");
        uint256 maxAmount = vm.envUint("MAX_AMOUNT");
        uint256 velocityLimit = vm.envUint("MAX_TRANSACTIONS_PER_HOUR");

        vm.startBroadcast();
        deployedPolicy = new IntentGuardPolicy(approvedRecipient, maxAmount, velocityLimit);
        vm.stopBroadcast();
    }
}
