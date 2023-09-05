const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("Base layer test", function () {
  async function deployContractsFixture() {
    const Initializer = await ethers.getContractFactory("AsterizmInitializerV1");
    const Transalor = await ethers.getContractFactory("AsterizmTranslatorV1");
    const Demo = await ethers.getContractFactory("AsterizmDemo");
    const [owner1, owner2] = await ethers.getSigners();
    const currentChainIds = [1, 2];
    const externalFees = [1, 1];
    const systemFees = [2, 2];
    const chainTypes = {EVM: 1, TVM: 2};

    const translator1 = await upgrades.deployProxy(Transalor, [currentChainIds[0], chainTypes.EVM], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await translator1.deployed();
    await translator1.addChains(currentChainIds, [chainTypes.EVM, chainTypes.EVM]);
    await translator1.addRelayer(owner1.address);

    const translator2 = await upgrades.deployProxy(Transalor, [currentChainIds[1], chainTypes.EVM], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await translator2.deployed();
    await translator2.addChains(currentChainIds, [chainTypes.EVM, chainTypes.EVM]);
    await translator2.addRelayer(owner1.address);

    const externalTranslator1 = await upgrades.deployProxy(Transalor, [currentChainIds[0], chainTypes.EVM], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await externalTranslator1.deployed();
    await externalTranslator1.addChains(currentChainIds, [chainTypes.EVM, chainTypes.EVM]);
    await externalTranslator1.addRelayer(owner1.address);

    const externalTranslator2 = await upgrades.deployProxy(Transalor, [currentChainIds[1], chainTypes.EVM], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await externalTranslator2.deployed();
    await externalTranslator2.addChains(currentChainIds, [chainTypes.EVM, chainTypes.EVM]);
    await externalTranslator2.addRelayer(owner1.address);

    // Initializer1 deployment
    const initializer1 = await upgrades.deployProxy(Initializer, [translator1.address], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await initializer1.deployed();
    await initializer1.manageTrustedRelay(externalTranslator1.address, externalFees[0], systemFees[0]);

    // Initializer2 deployment
    const initializer2 = await upgrades.deployProxy(Initializer, [translator2.address], {
      initialize: 'initialize',
      kind: 'uups',
    });
    await initializer2.deployed();
    await initializer2.manageTrustedRelay(externalTranslator2.address, externalFees[1], systemFees[1]);

    await translator1.setInitializer(initializer1.address);
    await translator2.setInitializer(initializer2.address);
    await externalTranslator1.setInitializer(initializer1.address);
    await externalTranslator2.setInitializer(initializer2.address);

    const demo1 = await Demo.deploy(initializer1.address);
    await demo1.deployed();
    const demo2 = await Demo.deploy(initializer2.address);
    await demo2.deployed();
    await demo1.addTrustedAddresses(currentChainIds, [demo1.address, demo2.address]);
    await demo2.addTrustedAddresses(currentChainIds, [demo1.address, demo2.address]);

    // Fixtures can return anything you consider useful for your tests
    return {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    };
  }

  it("Should successfully deploy contracts", async function () {
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
  });

  it("Should successfully send message", async function () {
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    await expect(demo1.sendMessage(currentChainIds[1], "New message")).not.to.be.reverted;
  })

  it("Should emit any event from Translator", async function () {
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    let feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    let PacketValue;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {PacketValue = value; return true;},
        );
  });

  it("Should send message from packet to Initializer", async function () {
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    let feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    await expect(demo1.sendMessage(currentChainIds[0], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[0]);
    expect(dstAddress).to.equal(demo1.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SuccessTransferEvent');

    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(1);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    let PacketValue;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {PacketValue = value; return true;},
        );
    await translator2.transferMessage(300000, PacketValue);
  });

  it("Should send message from packet to Initializer", async function () {
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    let feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    await expect(demo1.sendMessage(currentChainIds[0], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[0]);
    expect(dstAddress).to.equal(demo1.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SuccessTransferEvent');

    await expect(demo1.sendMessage(currentChainIds[1], ""))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(1);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    let PacketValue;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {PacketValue = value; return true;},
        );
    await translator2.transferMessage(300000, PacketValue);
  });

  it("Should not sent from/to blocked address, then success send message", async function () {
    let PacketValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);

    await expect(initializer1.addBlockAddress(currentChainIds[1], demo2.address))
        .to.emit(initializer1, 'AddBlockAddressEvent');
    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.be.revertedWith("AsterizmInitializer: target address is blocked");

    await expect(initializer1.addBlockAddress(currentChainIds[0], demo1.address))
        .to.emit(initializer1, 'AddBlockAddressEvent');
    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(1);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.be.revertedWith("AsterizmInitializer: sender address is blocked");

    await expect(initializer1.removeBlockAddress(currentChainIds[0], demo1.address))
        .to.emit(initializer1, 'RemoveBlockAddressEvent');
    await expect(initializer1.removeBlockAddress(currentChainIds[1], demo2.address))
        .to.emit(initializer1, 'RemoveBlockAddressEvent');
    await expect(demo1.sendMessage(currentChainIds[0], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[0]);
    expect(dstAddress).to.equal(demo1.address);
    expect(txId).to.equal(2);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SuccessTransferEvent');

    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(3);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {PacketValue = value; return true;},
        );
    const messageBefore = await demo1.externalChainMessage();
    await translator2.transferMessage(300000, PacketValue);
    expect(await demo1.externalChainMessage()).to.equal(messageBefore);
  });

  it("Should send message with fee", async function () {
    let PacketValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    const provider = ethers.provider;
    const feeAmount = ethers.utils.parseEther("1");
    await translator1.transferOwnership(owner2.address);
    const owner2BalanceBefore = await provider.getBalance(owner2.address);
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(translator1.address)).to.equal(0);
    let capturedValue;
    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash, {value: feeAmount}))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {capturedValue = value; return true;},
        );
    let decodedValue = ethers.utils.defaultAbiCoder.decode(['uint64', 'uint', 'uint64', 'uint', 'uint', 'bytes32'], capturedValue);
    expect(decodedValue[0]).to.equal(currentChainIds[0]); // srcChainId
    expect(decodedValue[1]).to.equal(demo1.address); // srcAddress
    expect(decodedValue[2]).to.equal(currentChainIds[1]); // dstChainId
    expect(decodedValue[3]).to.equal(demo2.address); // dstAddress
    expect(feeValue).to.equal(feeAmount); // feeValue
    expect(decodedValue[4]).to.equal(0); // txId
    expect(decodedValue[5]).to.not.null; // transferHash
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(translator1.address)).to.equal(0);
    expect(await provider.getBalance(owner2.address)).to.equal(owner2BalanceBefore.add(feeAmount));
  });

  it("Should resend message from client and initializer contracts", async function () {
    let PacketValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    const provider = ethers.provider;
    const feeAmount = ethers.utils.parseEther("1");
    await translator1.transferOwnership(owner2.address);
    const owner2BalanceBefore = await provider.getBalance(owner2.address);
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(translator1.address)).to.equal(0);
    let capturedValue;
    await expect(demo1.sendMessage(currentChainIds[1], "New message"))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash, {value: feeAmount}))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {capturedValue = value; return true;},
        );
    let decodedValue = ethers.utils.defaultAbiCoder.decode(['uint64', 'uint', 'uint64', 'uint', 'uint', 'bytes32'], capturedValue);
    expect(decodedValue[0]).to.equal(currentChainIds[0]); // srcChainId
    expect(decodedValue[1]).to.equal(demo1.address); // srcAddress
    expect(decodedValue[2]).to.equal(currentChainIds[1]); // dstChainId
    expect(decodedValue[3]).to.equal(demo2.address); // dstAddress
    expect(feeValue).to.equal(feeAmount); // feeValue
    expect(decodedValue[4]).to.equal(0); // txId
    expect(decodedValue[5]).to.not.null; // transferHash
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(translator1.address)).to.equal(0);
    expect(await provider.getBalance(owner2.address)).to.equal(owner2BalanceBefore.add(feeAmount));

    let resendFeeAmount = ethers.utils.parseEther("1");

    const wrongTransferHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
    await expect(demo1.resendAsterizmTransfer(wrongTransferHash, {value: resendFeeAmount}))
        .to.be.revertedWith("AsterizmClient: outbound transfer not exists");
    await expect(initializer1.resendTransfer(wrongTransferHash, '0x0000000000000000000000000000000000000000', {value: resendFeeAmount}))
        .to.be.revertedWith("AsterizmInitializer: transfer not exists");

    let resendResultHash, resendResultSender, resendResultAmount;
    await expect(demo1.resendAsterizmTransfer(transferHash, {value: resendFeeAmount}))
        .to.emit(translator1, 'ResendFailedTransferEvent')
        .withArgs(
            (value) => {resendResultHash = value; return true;},
            (value) => {resendResultSender = value; return true;},
            (value) => {resendResultAmount = value; return true;},
        );
    expect(resendResultHash).to.equal(transferHash);
    expect(resendResultSender).to.equal(demo1.address);
    expect(resendResultAmount).to.equal(resendFeeAmount);

    resendFeeAmount = ethers.utils.parseEther("2");
    await expect(initializer1.resendTransfer(transferHash, '0x0000000000000000000000000000000000000000', {value: resendFeeAmount}))
        .to.emit(translator1, 'ResendFailedTransferEvent')
        .withArgs(
            (value) => {resendResultHash = value; return true;},
            (value) => {resendResultSender = value; return true;},
            (value) => {resendResultAmount = value; return true;},
        );
    expect(resendResultHash).to.equal(transferHash);
    expect(resendResultSender).to.equal(owner1.address);
    expect(resendResultAmount).to.equal(resendFeeAmount);
  });

  it("Should transfer fully completed", async function () {
    let PacketValue, capturedValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    const newMessage = "New message";
    const provider = ethers.provider;
    const feeAmount = ethers.utils.parseEther("1");
    await expect(demo1.sendMessage(currentChainIds[1], newMessage))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash, {value: feeAmount}))
        .to.emit(translator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {capturedValue = value; return true;},
        );
    let decodedValue = ethers.utils.defaultAbiCoder.decode(['uint64', 'uint', 'uint64', 'uint', 'uint', 'bytes32'], capturedValue);
    expect(decodedValue[0]).to.equal(currentChainIds[0]); // srcChainId
    expect(decodedValue[1]).to.equal(demo1.address); // srcAddress
    expect(decodedValue[2]).to.equal(currentChainIds[1]); // dstChainId
    expect(decodedValue[3]).to.equal(demo2.address); // dstAddress
    expect(feeValue).to.equal(feeAmount); // feeValue
    expect(decodedValue[4]).to.equal(0); // txId
    expect(decodedValue[5]).to.not.null; // transferHash
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(translator1.address)).to.equal(0);
    await expect(translator2.transferMessage(300000, capturedValue))
        .to.emit(demo2, 'PayloadReceivedEvent');
    let payloadValue = ethers.utils.defaultAbiCoder.decode(['string'], payload.toString());
    expect(payloadValue[0]).to.equal(newMessage);
    await expect(demo2.asterizmClReceive(currentChainIds[0], demo1.address, decodedValue[4], decodedValue[5], payload)).to.not.reverted;
    expect(await demo2.externalChainMessage()).to.equal(newMessage);
  });

  it("Should transfer fully completed with external relays logic", async function () {
    let PacketValue, capturedValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    await expect(demo1.setExternalRelay(externalTranslator1.address)).to.not.reverted;
    await expect(demo1.setExternalRelay(externalTranslator1.address)).to.rejectedWith('AsterizmClient: relay changing not available');
    const newMessage = "New message with external relays logic";
    const provider = ethers.provider;
    const feeAmount = ethers.utils.parseEther("1");
    const feeAmountWithoutSystemFee = feeAmount.sub(systemFees[0]);
    await expect(demo1.sendMessage(currentChainIds[1], newMessage))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash, {value: feeAmount}))
        .to.emit(externalTranslator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {capturedValue = value; return true;},
        );
    let decodedValue = ethers.utils.defaultAbiCoder.decode(['uint64', 'uint', 'uint64', 'uint', 'uint', 'bytes32'], capturedValue);
    expect(decodedValue[0]).to.equal(currentChainIds[0]); // srcChainId
    expect(decodedValue[1]).to.equal(demo1.address); // srcAddress
    expect(decodedValue[2]).to.equal(currentChainIds[1]); // dstChainId
    expect(decodedValue[3]).to.equal(demo2.address); // dstAddress
    expect(feeValue).to.equal(feeAmountWithoutSystemFee); // feeValue
    expect(decodedValue[4]).to.equal(0); // txId
    expect(decodedValue[5]).to.not.null; // transferHash
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(externalTranslator1.address)).to.equal(0);
    await expect(externalTranslator2.transferMessage(300000, capturedValue))
        .to.emit(demo2, 'PayloadReceivedEvent');
    let payloadValue = ethers.utils.defaultAbiCoder.decode(['string'], payload.toString());
    expect(payloadValue[0]).to.equal(newMessage);
    await expect(demo2.asterizmClReceive(currentChainIds[0], demo1.address, decodedValue[4], decodedValue[5], payload)).to.not.reverted;
    expect(await demo2.externalChainMessage()).to.equal(newMessage);
  });

  it("Should transfer fully completed with external relays logic and updated fees", async function () {
    let PacketValue, capturedValue, feeValue, dstChainId, dstAddress, txId, transferHash, payload;
    const {
      Initializer, initializer1, initializer2, Transalor, translator1, translator2,
      externalTranslator1, externalTranslator2, Demo, demo1, demo2, owner1, owner2,
      currentChainIds, externalFees, systemFees
    } = await loadFixture(deployContractsFixture);
    await expect(demo1.setExternalRelay(externalTranslator1.address)).to.not.reverted;
    await expect(demo1.setExternalRelay(externalTranslator1.address)).to.rejectedWith('AsterizmClient: relay changing not available');
    const newMessage = "New message with external relays logic and updated fees";
    const provider = ethers.provider;
    const feeAmount = ethers.utils.parseEther("1");
    const newRelayFee = 10;
    const newSystemFee = 100;
    let manageInitAddress, manageRelayAddress, manageFee, manageSystemFee;
    await expect(initializer1.manageTrustedRelay(externalTranslator1.address, externalFees[0], newSystemFee))
        .to.emit(initializer1, 'TrustedRelayEvent')
        .withArgs(
            (value) => {manageInitAddress = value; return true;},
            (value) => {manageRelayAddress = value; return true;},
            (value) => {manageFee = value; return true;},
            (value) => {manageSystemFee = value; return true;},
        );
    expect(manageInitAddress).to.equal(owner1.address);
    expect(manageRelayAddress).to.equal(externalTranslator1.address);
    expect(manageFee).to.equal(externalFees[0]);
    expect(manageSystemFee).to.equal(newSystemFee);

    await expect(externalTranslator1.updateTrustedRelayFee(newRelayFee))
        .to.emit(initializer1, 'TrustedRelayEvent')
        .withArgs(
            (value) => {manageInitAddress = value; return true;},
            (value) => {manageRelayAddress = value; return true;},
            (value) => {manageFee = value; return true;},
            (value) => {manageSystemFee = value; return true;},
        );
    expect(manageInitAddress).to.equal(externalTranslator1.address);
    expect(manageRelayAddress).to.equal(externalTranslator1.address);
    expect(manageFee).to.equal(newRelayFee);
    expect(manageSystemFee).to.equal(newSystemFee);
    const feeAmountWithoutSystemFee = feeAmount.sub(newSystemFee);
    await expect(demo1.sendMessage(currentChainIds[1], newMessage))
        .to.emit(demo1, 'InitiateTransferEvent')
        .withArgs(
            (value) => {dstChainId = value; return true;},
            (value) => {dstAddress = value; return true;},
            (value) => {txId = value; return true;},
            (value) => {transferHash = value; return true;},
            (value) => {payload = value; return true;},
        );
    expect(dstChainId).to.equal(currentChainIds[1]);
    expect(dstAddress).to.equal(demo2.address);
    expect(txId).to.equal(0);
    expect(transferHash).to.not.null;
    expect(payload).to.not.null;
    await expect(demo1.initAsterizmTransfer(dstChainId, txId, transferHash, {value: feeAmount}))
        .to.emit(externalTranslator1, 'SendMessageEvent')
        .withArgs(
            (value) => {feeValue = value; return true;},
            (value) => {capturedValue = value; return true;},
        );
    let decodedValue = ethers.utils.defaultAbiCoder.decode(['uint64', 'uint', 'uint64', 'uint', 'uint', 'bytes32'], capturedValue);
    expect(decodedValue[0]).to.equal(currentChainIds[0]); // srcChainId
    expect(decodedValue[1]).to.equal(demo1.address); // srcAddress
    expect(decodedValue[2]).to.equal(currentChainIds[1]); // dstChainId
    expect(decodedValue[3]).to.equal(demo2.address); // dstAddress
    expect(feeValue).to.equal(feeAmountWithoutSystemFee); // feeValue
    expect(decodedValue[4]).to.equal(0); // txId
    expect(decodedValue[5]).to.not.null; // transferHash
    expect(await provider.getBalance(demo1.address)).to.equal(0);
    expect(await provider.getBalance(externalTranslator1.address)).to.equal(0);
    await expect(externalTranslator2.transferMessage(300000, capturedValue))
        .to.emit(demo2, 'PayloadReceivedEvent');
    let payloadValue = ethers.utils.defaultAbiCoder.decode(['string'], payload.toString());
    expect(payloadValue[0]).to.equal(newMessage);
    await expect(demo2.asterizmClReceive(currentChainIds[0], demo1.address, decodedValue[4], decodedValue[5], payload)).to.not.reverted;
    expect(await demo2.externalChainMessage()).to.equal(newMessage);
  });
});
