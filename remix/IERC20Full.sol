// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =============================================================================
// DEPRECATED — Do not use.
// This interface is INCOMPLETE: it does NOT expose transfer() or transferFrom().
// That caused ABI confusion and inability to send tokens from frontends/scripts.
// Use contracts/IERC20Standard.sol instead (full ERC20: transfer, transferFrom,
// approve, balanceOf, allowance).
// =============================================================================

interface IERC20Full {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}
