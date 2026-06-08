---
name: metamask-smart-account
description: Create, deploy, configure, and transact with MetaMask Smart Accounts using the Smart Accounts Kit. Use when the user wants to create a MetaMask smart account (single-owner or multisig), deploy it, configure signers (including Embedded Wallets), send user operations, send gasless transactions, generate multisig signatures, or integrate MetaMask Smart Accounts with Embedded Wallets/Web3Auth. Trigger on mentions of `toMetaMaskSmartAccount`, `Implementation`, multisig smart accounts, Embedded Wallets, Web3Auth, `aggregateSignature`, gasless transactions, user operations, or smart account deployment.
---

# MetaMask Smart Accounts

This skill teaches a coding agent how to create, deploy, configure, and transact with **MetaMask Smart Accounts** using the `@metamask/smart-accounts-kit`.

## When to use this skill

- Creating a MetaMask smart account (single-owner or multisig) with `toMetaMaskSmartAccount`
- Deploying a smart account contract
- Configuring signers, including integrating MetaMask Embedded Wallets (Web3Auth)
- Sending user operations via a bundler
- Sending gasless transactions (sponsored user ops)
- Generating multisig signatures with `aggregateSignature`
- Choosing the right `Implementation` (Hybrid, Stateless7702, etc.)

## Prerequisites

- Install `@metamask/smart-accounts-kit`, `viem`, and a wallet/bundler client

## Guides

### 1. Create a smart account

```ts
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
})

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [ownerAddress, [], [], []],
  deploySalt: '0x',
  signer: { privateKey: '0x...' }, // or { walletClient }
})
```

### 2. Deploy a smart account

If the account is not yet deployed, deploy it:

```ts
const hash = await smartAccount.deploy()
await publicClient.waitForTransactionReceipt({ hash })
```

### 3. Configure signers with Embedded Wallets

Use MetaMask Embedded Wallets (Web3Auth) as a signer:

```tsx
import { Web3AuthProvider } from '@web3auth/modal/react'
import { WagmiProvider } from '@web3auth/modal/react/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit'
import { useWalletClient, usePublicClient, useConnection } from 'wagmi'

// Wrap app with providers
export function Web3AuthAppProvider({ children }) {
  return (
    <Web3AuthProvider config={web3authConfig}>
      <QueryClientProvider client={new QueryClient()}>
        <WagmiProvider>{children}</WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  )
}

// Create smart account with Embedded Wallet signer
function useSmartAccount() {
  const { address } = useConnection()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [address, [], [], []],
    deploySalt: '0x',
    signer: { walletClient },
  })

  return smartAccount
}
```

### 4. Generate multisig signatures

For multisig smart accounts, collect signatures from multiple signers:

```ts
import { aggregateSignature } from '@metamask/smart-accounts-kit'

const userOperation = await bundlerClient.prepareUserOperation({
  account: aliceSmartAccount,
  calls: [{ to: zeroAddress, value: 0n, data: '0x' }],
})

const aliceSignature = await aliceSmartAccount.signUserOperation(userOperation)
const bobSignature = await bobSmartAccount.signUserOperation(userOperation)

const aggregatedSignature = aggregateSignature({
  signatures: [
    { signer: aliceAccount.address, signature: aliceSignature, type: 'ECDSA' },
    { signer: bobAccount.address, signature: bobSignature, type: 'ECDSA' },
  ],
})
```

### 5. Send a user operation

```ts
const hash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: recipient,
      value: parseEther('0.01'),
      data: '0x',
    },
  ],
})
```

### 6. Send a gasless transaction

Use a paymaster to sponsor gas:

```ts
const hash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [{ to: recipient, value: parseEther('0.01'), data: '0x' }],
  paymaster: true, // or provide paymaster context
})
```

## Implementation types

| Implementation | Description |
|---------------|-------------|
| `Implementation.Hybrid` | Supports both EOA and smart account features |
| `Implementation.Stateless7702` | EIP-7702 stateless delegator implementation |
| `Implementation.Multisig` | Multisig with multiple signers and threshold |

## Resources

- [MetaMask Smart Accounts Kit — Install guide](https://docs.metamask.io/smart-accounts-kit/get-started/install/)
- [Create smart account guide](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/create-smart-account/)
- [Send user operation guide](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/send-user-operation/)
- [Send gasless transaction guide](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/send-gasless-transaction/)
- [Multisig smart accounts concept](https://docs.metamask.io/smart-accounts-kit/concepts/smart-accounts/#multisig-smart-account)
- [Embedded Wallets guide](https://docs.metamask.io/embedded-wallets/)
- [Smart Account reference](https://docs.metamask.io/smart-accounts-kit/reference/smart-account/)
