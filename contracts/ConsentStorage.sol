// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConsentStorage {
    event ConsentStored(bytes32 hashValue, uint8 role, uint256 timestamp);

    // role: 0 = sender, 1 = receiver
    function storeConsent(bytes32 hashValue, uint8 role) public {
        emit ConsentStored(hashValue, role, block.timestamp);
    }
}