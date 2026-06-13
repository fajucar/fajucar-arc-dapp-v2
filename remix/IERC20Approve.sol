// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Uso no Remix (Arc Testnet + Rabby):
  a) Deploy do helper: abra ERC20TransferHelper.sol, compile, deploy. Anote o endereço do helper.
  b) Carregar USDC: Deploy & Run → "At Address" = 0x3600000000000000000000000000000000000000.
     Contract = IERC20Approve (compilar este arquivo antes). approve(helper, 10000000). Value = 0 → Transact.
  c) No helper: doTransfer(USDC, PAIR, 10000000). Value = 0 → Transact.
  d) EURC: "At Address" 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a, approve(helper, 10000000).
     Depois helper.doTransfer(EURC, PAIR, 10000000).
  USDC=0x3600000000000000000000000000000000000000
  EURC=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
  PAIR=0xF9758A1565E9A1380F599803Aa741718E1dC2A6e
*/

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
