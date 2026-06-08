# Use MetaMask Embedded Wallets with MetaMask Smart Accounts

[MetaMask Embedded Wallets (Web3Auth)](https://docs.metamask.io/embedded-wallets/) provides a pluggable embedded wallet
infrastructure to simplify Web3 wallet integration and user onboarding. It supports social sign-ins allowing
users to access Web3 applications through familiar authentication methods in under a minute.

MetaMask Smart Accounts is a signer-agnostic implementation that allows you to use Embedded Wallets as a signer for [smart accounts](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#metamask-smart-account)**MetaMask smart account** A smart contract account created using the Smart Accounts Kit that supports programmable behavior, flexible signing options, and ERC-7710 delegations..

This guide supports React and React-based frameworks.


## Prerequisites​

- Install [Node.js](https://nodejs.org/en/blog/release/v18.18.0) v18 or later.
- Install [Yarn](https://yarnpkg.com/),
[npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), or another package manager.
- Create an [Embedded Wallets Client ID](https://docs.metamask.io/embedded-wallets/dashboard/).


## Steps​


### 1. Install dependencies​

Install the [Smart Accounts Kit](https://www.npmjs.com/package/@metamask/smart-accounts-kit) and other dependencies in your project:

```
npm install @metamask/smart-accounts-kit @web3auth/modal wagmi @tanstack/react-query viem

```


### 2. Create the Web3Auth provider​

Configure the `Web3AuthProvider` component to provide the Embedded Wallets context to your application.
You'll also use the `WagmiProvider` to integrate Embedded Wallets with Wagmi.
This provider enables you to use Wagmi hooks with Embedded Wallets.

Once you've created the `Web3AuthAppProvider`, wrap it at the root of your application so
the rest of your application has access to the Embedded Wallets context.

For an advanced configuration, see the [Embedded Wallets guide](https://docs.metamask.io/embedded-wallets/sdk/react/advanced/).

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ReactNode } from "react";

import { Web3AuthProvider } from "@web3auth/modal/react";

// Make sure to import `WagmiProvider` from `@web3auth/modal/react/wagmi`, not `wagmi`

import { WagmiProvider } from "@web3auth/modal/react/wagmi";

import { web3authConfig } from "./config.ts";



const queryClient = new QueryClient();



export function Web3AuthAppProvider({ children }: { children: ReactNode }) {

  return (

    <Web3AuthProvider config={web3authConfig}>

      <QueryClientProvider client={queryClient}>

        <WagmiProvider>{children}</WagmiProvider>

      </QueryClientProvider>

    </Web3AuthProvider>

  );

}

```


### 3. Create a smart account​

Once the user has connected their wallet, use the [Wallet Client](https://viem.sh/docs/clients/wallet) from Wagmi as the signer to create a
[MetaMask smart account](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#metamask-smart-account)**MetaMask smart account** A smart contract account created using the Smart Accounts Kit that supports programmable behavior, flexible signing options, and ERC-7710 delegations..

```
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

import { useConnection, usePublicClient, useWalletClient } from 'wagmi'



const { address } = useConnection()

const publicClient = usePublicClient()

const { data: walletClient } = useWalletClient()



// Additional check to make sure the Embedded Wallets is connected

// and values are available.

if (!address || !walletClient || !publicClient) {

  // Handle the error case

}



const smartAccount = await toMetaMaskSmartAccount({

  client: publicClient,

  implementation: Implementation.Hybrid,

  deployParams: [address, [], [], []],

  deploySalt: '0x',

  signer: { walletClient },

})

```


## Next steps​

- See how to [send a user operations](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/send-user-operation/).
- To sponsor gas for end users, see how to [send a gasless transaction](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/send-gasless-transaction/).

