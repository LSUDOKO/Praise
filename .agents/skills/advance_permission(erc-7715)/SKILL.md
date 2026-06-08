---
name: advance-permission-erc-7715
description: Implement ERC-7715 Advanced Permissions with MetaMask Smart Accounts Kit. Use when the user wants to request execution permissions from a MetaMask user, check supported/granted permissions, execute transactions on a user's behalf via EIP-7715, use permission types (ERC-20 periodic, function call, etc.), create redelegations (delegation chains), or manage permission contexts. Trigger on mentions of `requestExecutionPermissions`, `getSupportedExecutionPermissions`, `redelegatePermissionContext`, `decodeDelegations`, `erc7715ProviderActions`, EIP-7715, ERC-7715, or Advanced Permissions.
---

# Advanced Permissions (ERC-7715)

This skill teaches a coding agent how to implement **ERC-7715 Advanced Permissions** using the MetaMask Smart Accounts Kit. Advanced Permissions allow dapps to request fine-grained, wallet execution permissions from MetaMask users, enabling delegated transaction execution with specific constraints.

## When to use this skill

- Requesting execution permissions from a MetaMask user via `requestExecutionPermissions`
- Checking which permission types a wallet supports via `getSupportedExecutionPermissions`
- Retrieving granted permissions with `getGrantedPermissions`
- Executing transactions on a user's behalf using an ERC-7715 permission context
- Creating redelegations (delegation chains) to share narrowed permissions with sub-agents
- Using specific permission types: ERC-20 periodic, ERC-20 transfer amount, function call, etc.

## Prerequisites

- Install `@metamask/smart-accounts-kit` (recommend `^1.3.0`)
- The user's wallet must support EIP-7715 (MetaMask Flask ≥13.5 or MetaMask production ≥13.23)
- The user must be upgraded to a MetaMask Smart Account (EIP-7702)

## Key Concepts

- **Delegator account** — The MetaMask account that creates and signs a delegation to grant limited authority to another account.
- **Delegate account** — The account that receives delegated authority and can redeem a delegation under its constraints.
- **Permission context** — The signed data representing the granted permissions, used to execute transactions or create redelegations.
- **Redelegation** — A delegation chain where a delegate passes on the same or reduced level of authority to another account.

## Guides

### 1. Check supported permissions

Before requesting permissions, check which permission types the connected wallet supports:

```ts
import { createWalletClient, custom } from 'viem'
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions'

const walletClient = createWalletClient({
  transport: custom(window.ethereum),
}).extend(erc7715ProviderActions())

const supported = await walletClient.getSupportedExecutionPermissions()
console.log(supported) // e.g. { permissions: ['erc20-token-periodic', ...] }
```

### 2. Request execution permissions

Request Advanced Permissions from the user with `requestExecutionPermissions`:

```ts
import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'
import { sessionAccount, walletClient, tokenAddress } from './config'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800 // 1 week from now

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress,
        periodAmount: parseUnits('10', 6), // 10 USDC (6 decimals)
        periodDuration: 86400, // 1 day in seconds
        justification: 'Permission to transfer 10 USDC every day',
      },
      isAdjustmentAllowed: true,
    },
  },
])
```

### 3. Get granted permissions

Retrieve the currently granted permissions for the connected session:

```ts
const granted = await walletClient.getGrantedPermissions()
// Returns array of granted permission contexts
```

### 4. Execute on a user's behalf

Use the granted permission context to execute transactions on behalf of the delegator:

```ts
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia as chain } from 'viem/chains'

const environment = getSmartAccountsEnvironment(chain.id)

const result = await sessionAccount.executePermissionContext({
  environment,
  permissionContext: grantedPermissions[0].context,
  calls: [
    {
      to: recipientAddress,
      value: 0n,
      data: encodeFunctionData({ /* ... */ }),
    },
  ],
})
```

### 5. Create a redelegation

A delegate can create a redelegation, passing on reduced authority to another account:

```ts
import {
  createDelegation,
  ScopeType,
  getSmartAccountsEnvironment,
  Caveats,
  CaveatType,
} from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'
import { sepolia as chain } from 'viem/chains'

const caveats: Caveats = [
  {
    type: CaveatType.Erc20TransferAmount,
    tokenAddress,
    maxAmount: parseUnits('5', 6), // 5 USDC (narrowed from 10)
  },
]

const environment = getSmartAccountsEnvironment(chain.id)

const { permissionContext: signedPermissionContext } =
  await sessionAccount.redelegatePermissionContext({
    to: agentAccount.address,
    environment,
    permissionContext: grantedPermissions[0].context,
    caveats,
  })
```

When creating a redelegation, you can only **narrow** the scope of the original authority, never expand it.

## Permission types

| Type | Description |
|------|-------------|
| `erc20-token-periodic` | Spend up to X tokens every Y period |
| `erc20-token-amount` | Spend up to X tokens total |
| `function-call` | Call specific contract functions |

## Resources

- [MetaMask Smart Accounts Kit — Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/)
- [Execute on MetaMask user's behalf guide](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/execute-on-metamask-users-behalf/)
- [Wallet Client reference](https://docs.metamask.io/smart-accounts-kit/reference/advanced-permissions/wallet-client/)
- [Glossary — Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#advanced-permissions)
