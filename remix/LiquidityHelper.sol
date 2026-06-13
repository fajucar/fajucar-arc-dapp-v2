// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =============================================================================
// DEPRECATED — Do not use.
// This helper used IERC20.transferFrom() which expects a bool return. Precompile
// tokens (e.g. USDC on Arc) do not return bool, causing reverts. It also
// duplicated logic that belongs in the Router.
// Use ArcDEXRouter.addLiquidity() instead (contracts/ArcDEXRouter.sol).
// =============================================================================

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IArcDEXPair {
    function mint(address to) external returns (uint256 liquidity);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

contract LiquidityHelper {
    function addLiquidity(
        address pair,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external returns (uint256 liquidity) {
        // Verificar ordem dos tokens (pair espera token0 < token1)
        address token0 = IArcDEXPair(pair).token0();
        address token1 = IArcDEXPair(pair).token1();
        
        // Determinar qual token é token0 e qual é token1
        uint256 amount0;
        uint256 amount1;
        
        if (tokenA == token0) {
            require(tokenB == token1, "wrong token order");
            amount0 = amountA;
            amount1 = amountB;
        } else if (tokenA == token1) {
            require(tokenB == token0, "wrong token order");
            amount0 = amountB;
            amount1 = amountA;
        } else {
            revert("token not in pair");
        }
        
        // Transferir ambos os tokens para o pair
        require(IERC20Minimal(token0).transferFrom(msg.sender, pair, amount0), "transfer token0 failed");
        require(IERC20Minimal(token1).transferFrom(msg.sender, pair, amount1), "transfer token1 failed");
        
        // Chamar mint() no pair para criar liquidez
        liquidity = IArcDEXPair(pair).mint(msg.sender);
    }
}
