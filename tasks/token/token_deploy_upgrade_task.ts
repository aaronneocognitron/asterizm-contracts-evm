import "@nomicfoundation/hardhat-toolbox";
import { task } from 'hardhat/config';
import { BigNumber } from "ethers";

async function deployBase(hre, initializerAddress) {
    const [owner] = await ethers.getSigners();
    const Initializer = await ethers.getContractFactory("AsterizmInitializerV1");

    let gasLimit = BigNumber.from(0);
    const initializer = await Initializer.attach(initializerAddress);

    return {initializer, owner, gasLimit};
}

task("token:deploy-upgrade", "Deploy Multichain token contract (upgradeable)")
    .addPositionalParam("initializerAddress", "Initializer contract address")
    .addPositionalParam("initSupply", "Initial token supply", '0')
    .addPositionalParam("relayAddress", "Config contract address", '0')
    .addPositionalParam("feeTokenAddress", "Chainlink fee token address", '0')
    .addPositionalParam("gasPrice", "Gas price (for some networks)", '0')
    .setAction(async (taskArgs, hre) => {
        let {initializer, owner, gasLimit} = await deployBase(hre, taskArgs.initializerAddress);

        let tx;
        const gasPrice = parseInt(taskArgs.gasPrice);
        console.log("Deploying token contract...");
        const Token = await ethers.getContractFactory("MultiChainTokenUpgradeableV1");
        const token = await upgrades.deployProxy(Token, [initializer.address, BigNumber.from(taskArgs.initSupply)], {
            initialize: 'initialize',
            kind: 'uups',
        });
        tx = await token.deployed();
        gasLimit = gasLimit.add(tx.deployTransaction.gasLimit);
        if (taskArgs.relayAddress != '0') {
            tx = await token.setExternalRelay(taskArgs.relayAddress, gasPrice > 0 ? {gasPrice: gasPrice} : {});
            gasLimit = gasLimit.add(tx.gasLimit);
            console.log("Set external relay successfully. Address: %s", taskArgs.relayAddress);
        }
        if (taskArgs.feeTokenAddress != '0') {
            tx = await token.setFeeToken(taskArgs.feeTokenAddress, gasPrice > 0 ? {gasPrice: gasPrice} : {});
            gasLimit = gasLimit.add(tx.gasLimit);
            console.log("Set external relay successfully. Address: %s", taskArgs.relayAddress);
        }

        console.log("Deployment was done\n");
        console.log("Total gas limit: %s", gasLimit);
        console.log("Owner address: %s", owner.address);
        console.log("Initializer address: %s", initializer.address);
        if (taskArgs.relayAddress != '0') {
            console.log("External relay address: %s", taskArgs.relayAddress);
        }
        console.log("Multichain token address: %s\n", token.address);
    })