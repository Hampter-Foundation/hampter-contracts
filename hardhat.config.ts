import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: __dirname + "/.env" });

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    buildbear: {
      url: "https://rpc.buildbear.io/yelling-mockingbird-c5482cbb",
      accounts: [
        "0xc654e3e469cd86131473b30d0bf9087ab5f5d3b73e750fc1f1cb9db71b13581e",
      ],
    },
    arbitrumSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    enabled: true,
    apiKey: {
      buildbear: "verifyContract",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "buildbear",
        chainId: 18348,
        urls: {
          apiURL:
            "https://rpc.buildbear.io/verify/etherscan/yelling-mockingbird-c5482cbb",
          browserURL:
            "https://explorer.buildbear.io/yelling-mockingbird-c5482cbb",
        },
      },
    ],
  },
};

export default config;
