// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Uso no Remix (Arc Testnet + Rabby):
  a) Deploy: Contract = ERC20TransferHelper, Value = 0 → Deploy. Anote o endereço do helper.
  b) Load USDC "At Address" 0x3600000000000000000000000000000000000000 (use IERC20Approve).
     Chame approve(spender = endereço do helper, amount = 10000000). Value = 0 → Transact.
  c) No helper deployado: doTransfer(token = USDC, to = PAIR, amount = 10000000). Value = 0 → Transact.
  d) EURC: "At Address" 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a, approve(helper, 10000000).
     Depois helper.doTransfer(EURC, PAIR, 10000000).
  Dados: USDC=0x3600000000000000000000000000000000000000
         EURC=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
         PAIR=0xF9758A1565E9A1380F599803Aa741718E1dC2A6e
*/

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @dev Helper seguro: aceita tokens que retornam vazio (ex. USDC precompile).
 *      Regra: success && (data.length == 0 || abi.decode(data, (bool))).
 */
contract ERC20TransferHelper {
    function doTransfer(address token, address to, uint256 amount) external returns (bool) {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, msg.sender, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
        return true;
    }
}
