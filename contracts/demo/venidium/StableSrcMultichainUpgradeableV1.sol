// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/IMultiChainToken.sol";
import "../../base/AsterizmClientUpgradeable.sol";

contract StableSrcMultichainUpgradeableV1 is IMultiChainToken, ERC20Upgradeable, AsterizmClientUpgradeable {

    using SafeERC20 for IERC20;
    using UintLib for uint;

    IERC20 public tokenAddress;
    uint8 public customDecimals;

    /// Initializing function for upgradeable contracts (constructor)
    /// @param _initializerLib IInitializerSender  Initializer library address
    /// @param _initialSupply uint  Initial supply
    /// @param _decimals uint8  Decimals
    /// @param _tokenAddress IERC20  Expectation token address
    function initialize(IInitializerSender _initializerLib, uint _initialSupply, uint8 _decimals, IERC20 _tokenAddress) initializer public {
        __AsterizmClientUpgradeable_init(_initializerLib, true, false);
        __ERC20_init("UnknownTokenSS", "UTSS");
        _mint(_msgSender(), _initialSupply);
        tokenAddress = _tokenAddress;
        customDecimals = _decimals;
        tokenWithdrawalIsDisable = true;
    }

    /// Token decimals
    /// @dev change it for your token logic
    /// @return uint8
    function decimals() public view virtual override returns (uint8) {
        return customDecimals;
    }

    /// Cross-chain transfer
    /// @param _dstChainId uint64  Destination chain ID
    /// @param _from address  From address
    /// @param _to uint  To address in uint format
    function crossChainTransfer(uint64 _dstChainId, address _from, uint _to, uint _amount) public payable {
        require(_amount > 0, "StableSrcMultichain: amount too small");
        tokenAddress.safeTransferFrom(_from, address(this), _amount);
        _initAsterizmTransferEvent(_dstChainId, abi.encode(_to, _amount, _getTxId()));
    }

    /// Receive non-encoded payload
    /// @param _dto ClAsterizmReceiveRequestDto  Method DTO
    function _asterizmReceive(ClAsterizmReceiveRequestDto memory _dto) internal override {
        (uint dstAddressUint, uint amount, ) = abi.decode(_dto.payload, (uint, uint, uint));
        require(tokenAddress.balanceOf(address(this)) >= amount, "StableSrcMultichain: insufficient token funds");
        tokenAddress.safeTransfer(dstAddressUint.toAddress(), amount);
    }

    /// Build packed payload (abi.encodePacked() result)
    /// @param _payload bytes  Default payload (abi.encode() result)
    /// @return bytes  Packed payload (abi.encodePacked() result)
    function _buildPackedPayload(bytes memory _payload) internal pure override returns(bytes memory) {
        (uint dstAddressUint, uint amount, uint txId) = abi.decode(_payload, (uint, uint, uint));

        return abi.encodePacked(dstAddressUint, amount, txId);
    }
}
