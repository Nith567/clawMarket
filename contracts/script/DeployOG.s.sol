// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentFactory} from "../src/AgentFactory.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

/// @notice Deploys AgentFactory + BountyEscrow on 0G Chain testnet, wires them together.
/// Usage:
///   forge script script/DeployOG.s.sol \
///     --rpc-url $OG_TESTNET_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast --legacy
contract DeployOG is Script {
    function run() external {
        address admin = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        vm.startBroadcast();
        AgentFactory factory = new AgentFactory(admin);
        BountyEscrow escrow = new BountyEscrow(address(factory));
        factory.setBountyEscrow(address(escrow));
        vm.stopBroadcast();

        console2.log("AgentFactory:", address(factory));
        console2.log("BountyEscrow:", address(escrow));
        console2.log("Admin:", admin);
    }
}
