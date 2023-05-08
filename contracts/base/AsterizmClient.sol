// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IInitializerSender.sol";
import "../interfaces/IClientReceiverContract.sol";
import "./BaseAsterizmEnv.sol";

abstract contract AsterizmClient is Ownable, ReentrancyGuard, IClientReceiverContract, BaseAsterizmEnv {

    /// Set initializer event
    /// @param _initializerAddress address  Initializer address
    event SetInitializerEvent(address _initializerAddress);

    /// Set local chain id event
    /// @param _localChainId uint64
    event SetLocalChainIdEvent(uint64 _localChainId);

    /// Initiate transfer event (for client server logic)
    /// @param _dstChainId uint64  Destination chein ID
    /// @param _dstAddress address  Destination address
    /// @param _txId uint  Transaction ID
    /// @param _transferHash bytes32  Transfer hash
    /// @param _payload bytes  Payload
    event InitiateTransferEvent(uint64 _dstChainId, address _dstAddress, uint _txId, bytes32 _transferHash, bytes _payload);

    /// Payload receive event (for client server logic)
    /// @param _srcChainId uint64  Source chain ID
    /// @param _srcAddress address  Source address
    /// @param _nonce uint  Transaction nonce
    /// @param _txId uint  Transfer ID
    /// @param _transferHash bytes32  Transaction hash
    /// @param _payload bytes  Payload
    event PayloadReceivedEvent(uint64 _srcChainId, address _srcAddress, uint _nonce, uint _txId, bytes32 _transferHash, bytes _payload);

    /// Add trusted address event
    /// @param _chainId uint64  Chain ID
    /// @param _address address  Trusted address
    event AddTrustedSourceAddressEvent(uint64 _chainId, address _address);

    /// Remove trusted address event
    /// @param _chainId uint64  Chain ID
    /// @param _address address  Trusted address
    event RemoveTrustedSourceAddressEvent(uint64 _chainId, address _address);

    /// Set use encryption flag
    /// @param _flag bool  Use encryption flag
    event SetUseEncryptionEvent(bool _flag);

    /// Set use force order flag event
    /// @param _flag bool  Use force order flag
    event SetUseForceOrderEvent(bool _flag);

    /// Set disable hash validation flag event
    /// @param _flag bool  Use force order flag
    event SetDisableHashValidationEvent(bool _flag);

    struct AsterizmTransfer {
        bool successReceive;
        bool successExecute;
    }

    IInitializerSender private initializerLib;
    mapping(uint64 => address) private trustedSrcAddresses;
    mapping(bytes32 => AsterizmTransfer) private inboundTransfers;
    mapping(bytes32 => AsterizmTransfer) private outboundTransfers;
    bool private mustCheckTrustedSrcAddresses;
    bool private useForceOrder;
    bool private disableHashValidation;
    uint private txId;
    uint64 private localChainId;

    constructor(IInitializerSender _initializerLib, bool _useForceOrder, bool _disableHashValidation) {
        _setInitializer(_initializerLib);
        _setLocalChainId(initializerLib.getLocalChainId());
        _setUseForceOrder(_useForceOrder);
        _setDisableHashValidation(_disableHashValidation);
    }

    /// Only initializer modifier
    modifier onlyInitializer {
        require(msg.sender == address(initializerLib), "BaseAsterizmClient: only initializer");
        _;
    }

    /// Only owner or initializer modifier
    modifier onlyOwnerOrInitializer {
        require(msg.sender == owner() || msg.sender == address(initializerLib), "BaseAsterizmClient: only owner or initializer");
        _;
    }

    /// Only trusted source address modifier
    /// You must add trusted source addresses in production networks!
    modifier onlyTrustedSrcAddress(uint64 _chainId, address _address) {
        if (mustCheckTrustedSrcAddresses) {
            require(trustedSrcAddresses[_chainId] == _address, "BaseAsterizmClient: wrong source address");
        }
        _;
    }

    /// Only trusted trarnsfer modifier
    /// Validate transfer hash on initializer
    /// Use this modifier for validate transfer by hash
    /// @param _transferHash bytes32  Transfer hash
    modifier onlyTrustedTransfer(bytes32 _transferHash) {
        require(initializerLib.validIncomeTransferHash(_transferHash), "BaseAsterizmClient: transfer hash is invalid");
        _;
    }

    /// Set receive transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier setReceiveTransfer(bytes32 _transferHash) {
        _;
        inboundTransfers[_transferHash].successReceive = true;
    }

    /// Set execute transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier setExecuteTransfer(bytes32 _transferHash) {
        _;
        inboundTransfers[_transferHash].successExecute = true;
    }

    /// Only received transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier onlyReceivedTransfer(bytes32 _transferHash) {
        require(inboundTransfers[_transferHash].successReceive, "BaseAsterizmClient: transfer not received");
        _;
    }

    /// Only non-executed transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier onlyNonExecuted(bytes32 _transferHash) {
        require(!inboundTransfers[_transferHash].successExecute, "BaseAsterizmClient: transfer executed already");
        _;
    }

    /// Set executed outbound transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier setExecutedOutboundTransfer(bytes32 _transferHash) {
        _;
        outboundTransfers[_transferHash].successExecute = true;
    }

    /// Only exists outbound transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier onlyExistsOutboundTransfer(bytes32 _transferHash) {
        require(outboundTransfers[_transferHash].successReceive, "BaseAsterizmClient: outbound transfer not exists");
        _;
    }

    /// Only not executed outbound transfer modifier
    /// @param _transferHash bytes32  Transfer hash
    modifier onlyNotExecutedOutboundTransfer(bytes32 _transferHash) {
        require(!outboundTransfers[_transferHash].successExecute, "BaseAsterizmClient: outbound transfer executed already");
        _;
    }

    /// Only nvalid transfer hash modifier
    /// @param _dto ClAsterizmReceiveRequestDto  Transfer data
    modifier onlyValidTransferHash(ClAsterizmReceiveRequestDto memory _dto) {
        if (!disableHashValidation) {
            require(
                _validTransferHash(_dto.srcChainId, _dto.srcAddress, _dto.dstChainId, _dto.dstAddress, _dto.txId, _dto.payload, _dto.transferHash),
                "BaseAsterizmClient: transfer hash is invalid"
            );
        }
        _;
    }

    /** Internal logic */

    /// Set initizlizer library
    /// _initializerLib IInitializerSender  Initializer library
    function _setInitializer(IInitializerSender _initializerLib) private {
        initializerLib = _initializerLib;
        emit SetInitializerEvent(address(_initializerLib));
    }

    /// Set local chain id library
    /// _localChainId uint64
    function _setLocalChainId(uint64 _localChainId) private {
        localChainId = _localChainId;
        emit SetLocalChainIdEvent(_localChainId);
    }

    /// Set use force order flag
    /// _flag bool  Use force order flag
    function _setUseForceOrder(bool _flag) private {
        useForceOrder = _flag;
        emit SetUseForceOrderEvent(_flag);
    }

    /// Set disable hash validation flag
    /// _flag bool  Disable hash validation flag
    function _setDisableHashValidation(bool _flag) private {
        disableHashValidation = _flag;
        emit SetDisableHashValidationEvent(_flag);
    }

    /// Add trusted source address
    /// @param _chainId uint64  Chain ID
    /// @param _trustedAddress address  Trusted address
    function addTrustedSourceAddress(uint64 _chainId, address _trustedAddress) public onlyOwner {
        trustedSrcAddresses[_chainId] = _trustedAddress;
        mustCheckTrustedSrcAddresses = true;

        emit AddTrustedSourceAddressEvent(_chainId, _trustedAddress);
    }

    /// Add trusted source addresses
    /// @param _chainIds uint64[]  Chain IDs
    /// @param _trustedAddresses address[]  Trusted addresses
    function addTrustedSourceAddresses(uint64[] calldata _chainIds, address[] calldata _trustedAddresses) external onlyOwner {
        for (uint i = 0; i < _chainIds.length; i++) {
            addTrustedSourceAddress(_chainIds[i], _trustedAddresses[i]);
        }
    }

    /// Change checking trusted source addresses flag
    /// @param _flag bool  Checking logic flag
    function changeCheckingTrustedSourceAddresses(bool _flag) external onlyOwner {
        mustCheckTrustedSrcAddresses = _flag;
    }

    /// Remove trusted address
    /// @param _chainId uint64  Chain ID
    function removeTrustedSourceAddress(uint64 _chainId) external onlyOwner {
        require(trustedSrcAddresses[_chainId] != address(0), "BaseAsterizmClient: trusted address not found");
        address removingAddress = trustedSrcAddresses[_chainId];
        delete trustedSrcAddresses[_chainId];

        emit RemoveTrustedSourceAddressEvent(_chainId, removingAddress);
    }

    /// Build transfer hash
    /// @param _srcChainId uint64  Chain ID
    /// @param _srcAddress address  Address
    /// @param _dstChainId uint64  Chain ID
    /// @param _dstAddress address  Address
    /// @param _txId uint  Transaction ID
    /// @param _payload bytes  Payload
    function _buildTransferHash(uint64 _srcChainId, address _srcAddress, uint64 _dstChainId, address _dstAddress, uint _txId, bytes memory _payload) internal pure returns(bytes32) {
        return keccak256(abi.encode(_srcChainId, _srcAddress, _dstChainId, _dstAddress, _txId, _payload));
    }

    /// Check is transfer hash valid
    /// @param _srcChainId uint64  Chain ID
    /// @param _srcAddress address  Address
    /// @param _dstChainId uint64  Chain ID
    /// @param _dstAddress address  Address
    /// @param _txId uint  Transaction ID
    /// @param _payload bytes  Payload
    /// @param _transferHash bytes32  Transfer hash
    function _validTransferHash(uint64 _srcChainId, address _srcAddress, uint64 _dstChainId, address _dstAddress, uint _txId, bytes memory _payload, bytes32 _transferHash) internal pure returns(bool) {
        return _buildTransferHash(_srcChainId, _srcAddress, _dstChainId, _dstAddress, _txId, _payload) == _transferHash;
    }

    /// Return txId
    /// @return uint
    function _getTxId() internal view returns(uint) {
        return txId;
    }

    /// Return local chain id
    /// @return uint64
    function _getLocalChainId() internal view returns(uint64) {
        return localChainId;
    }

    /// Return initializer address
    /// @return address
    function getInitializerAddress() external view returns(address) {
        return address(initializerLib);
    }

    /// Return trusted src addresses
    /// @param _chainId uint64  Chain id
    /// @return address
    function getTrustedSrcAddresses(uint64 _chainId) external view returns(address) {
        return trustedSrcAddresses[_chainId];
    }

    /// Return must check trusted src addresses flag
    /// @return bool
    function getTrustedSrcAddresses() external view returns(bool) {
        return mustCheckTrustedSrcAddresses;
    }

    /// Return use force order flag
    /// @return bool
    function getUseForceOrder() external view returns(bool) {
        return useForceOrder;
    }

    /// Return disable hash validation flag
    /// @return bool
    function getDisableHashValidation() external view returns(bool) {
        return disableHashValidation;
    }

    /** External logic */

    /** Sending logic */

    /// Initiate transfer event
    /// Generate event for client server
    /// @param _dto ClInitTransferEventDto  Init transfer DTO
    function _initAsterizmTransferEvent(ClInitTransferEventDto memory _dto) internal {
        uint id = txId++;
        bytes32 transferHash = _buildTransferHash(_getLocalChainId(), address(this), _dto.dstChainId, _dto.dstAddress, id, _dto.payload);
        outboundTransfers[transferHash].successReceive = true;
        emit InitiateTransferEvent(_dto.dstChainId, _dto.dstAddress, id, transferHash, _dto.payload);
    }

    /// External initiation transfer
    /// This function needs for external initiating non-encoded payload transfer
    /// @param _dstChainId uint64  Destination chain ID
    /// @param _dstAddress address  Destination address
    /// @param _transferHash bytes32  Transfer hash
    /// @param _txId uint  Transaction ID
    /// @param _payload bytes  Payload
    function initAsterizmTransfer(uint64 _dstChainId, address _dstAddress, uint _txId, bytes32 _transferHash, bytes calldata _payload) external payable onlyOwner nonReentrant {
        ClInitTransferRequestDto memory dto = _buildClInitTransferRequestDto(_dstChainId, _dstAddress, _txId, _transferHash, msg.value, _payload);
        _initAsterizmTransferPrivate(dto);
    }

    /// Private initiation transfer
    /// This function needs for internal initiating non-encoded payload transfer
    /// @param _dto ClInitTransferRequestDto  Init transfer DTO
    function _initAsterizmTransferPrivate(ClInitTransferRequestDto memory _dto) private
        onlyExistsOutboundTransfer(_dto.transferHash)
        onlyNotExecutedOutboundTransfer(_dto.transferHash)
        setExecutedOutboundTransfer(_dto.transferHash)
    {
        require(address(this).balance >= _dto.feeAmount, "BaseAsterizmClient: contract balance is not enough");
        require(_dto.txId <= _getTxId(), "BaseAsterizmClient: wrong txId param");
        initializerLib.initTransfer{value: _dto.feeAmount} (
            _buildIzIninTransferRequestDto(_dto.dstChainId, _dto.dstAddress, _dto.txId, _dto.transferHash, useForceOrder, _dto.payload)
        );
    }

    /** Receiving logic */

    /// Receive payload from initializer
    /// @param _dto ClAsterizmReceiveRequestDto  Method DTO
    function asterizmIzReceive(ClAsterizmReceiveRequestDto calldata _dto) external onlyInitializer nonReentrant {
        _asterizmReceiveExternal(_dto);
    }

    /// Receive external payload
    /// @param _dto ClAsterizmReceiveRequestDto  Method DTO
    function _asterizmReceiveExternal(ClAsterizmReceiveRequestDto calldata _dto) private
        onlyOwnerOrInitializer
        onlyTrustedSrcAddress(_dto.srcChainId, _dto.srcAddress)
        onlyNonExecuted(_dto.transferHash)
        setReceiveTransfer(_dto.transferHash)
    {
        emit PayloadReceivedEvent(_dto.srcChainId, _dto.srcAddress, _dto.nonce, _dto.txId, _dto.transferHash, _dto.payload);
    }

    /// Receive payload from client server
    /// @param _srcChainId uint64  Source chain ID
    /// @param _srcAddress address  Source address
    /// @param _dstChainId uint64  Destination chain ID
    /// @param _dstAddress address  Destination address
    /// @param _nonce uint  Nonce
    /// @param _txId uint  Transaction ID
    /// @param _transferHash bytes32  Transfer hash
    /// @param _payload bytes  Payload
    function asterizmClReceive(uint64 _srcChainId, address _srcAddress, uint64 _dstChainId, address _dstAddress, uint _nonce, uint _txId, bytes32 _transferHash, bytes calldata _payload) external onlyOwner nonReentrant {
        ClAsterizmReceiveRequestDto memory dto = _buildClAsterizmReceiveRequestDto(_srcChainId, _srcAddress, _dstChainId, _dstAddress, _nonce, _txId, _transferHash, _payload);
        _asterizmReceiveInternal(dto);
    }

    /// Receive non-encoded payload for internal usage
    /// @param _dto ClAsterizmReceiveRequestDto  Method DTO
    function _asterizmReceiveInternal(ClAsterizmReceiveRequestDto memory _dto) private
        onlyOwnerOrInitializer
        onlyReceivedTransfer(_dto.transferHash)
        onlyTrustedSrcAddress(_dto.srcChainId, _dto.srcAddress)
        onlyTrustedTransfer(_dto.transferHash)
        onlyNonExecuted(_dto.transferHash)
        onlyValidTransferHash(_dto) 
        setExecuteTransfer(_dto.transferHash) {
        _asterizmReceive(_dto);
    }

    /// Receive non-encoded payload
    /// You must realize this function if you want to transfer non-encoded payload
    /// You must use onlyTrustedSrcAddress modifier!
    /// If disableHashValidation = true you must validate transferHash with _validTransferHash() or use onlyValidTransferHash modifyer for more security!
    /// For validate transfer you can use onlyTrustedTransfer modifier
    /// @param _dto ClAsterizmReceiveRequestDto  Method DTO
    function _asterizmReceive(ClAsterizmReceiveRequestDto memory _dto) internal virtual {}
}