// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistrar} from "../src/AgentRegistrar.sol";

/// @notice Deploys AgentRegistrar on Base Sepolia and points it at the Durin L2Registry.
/// Usage:
///   forge script script/DeployBaseSepolia.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast
///
/// After deploy: call addRegistrar(<registrar>) on the L2Registry through Durin's UI
/// (or call it directly with cast send).
contract DeployBaseSepolia is Script {
    function run() external {
        address registry = vm.envAddress("L2_REGISTRY_ADDRESS"); // 0x4677e1b9035d98e60d5f23b43cf0d26d99a704fa

        vm.startBroadcast();
        AgentRegistrar registrar = new AgentRegistrar(registry);
        vm.stopBroadcast();

        console2.log("AgentRegistrar deployed at:", address(registrar));
        console2.log("Registry:", registry);
        console2.log("");
        console2.log("Next: call L2Registry.addRegistrar(%s) to authorize.", address(registrar));
    }
}
