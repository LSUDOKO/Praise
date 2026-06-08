---
name: delegations
description: Manage ERC-7710 delegations with the MetaMask Smart Accounts Kit. Use when the user wants to create, check, disable, or scope delegations; execute transactions on a smart account's behalf; create redelegations; use delegation scopes with caveats/enforcers; or work with ERC-7710 delegation primitives. Trigger on mentions of `createDelegation`, `ScopeType`, `redelegatePermissionContext`, `decodeDelegations`, `CaveatType`, ERC-7710 delegation, delegation scopes, or executing on behalf of a smart account.
---

# Delegations (ERC-7710)

This skill teaches a coding agent how to manage **ERC-7710 delegations** using the MetaMask Smart Accounts Kit. Delegations allow an account (delegator) to grant limited execution authority to another account (delegate), with optional caveats and scopes.

## When to use this skill

- Creating delegations with `createDelegation`
- Executing transactions on a smart account's behalf
- Using delegation scopes with enforcers/caveats (`ScopeType`, `CaveatType`)
- Checking existing delegations for a smart account
- Disabling delegations
- Creating redelegations (delegation chains)
- Understanding and applying delegation caveats (ERC-20 transfer amount, function call, etc.)

## Prerequisites

- Install `@metamask/smart-accounts-kit` (recommend `^1.3.0`)
- The smart account must be deployed and accessible

## Key Concepts

- **Delegator** — The account that creates and signs a delegation to grant limited authority
- **Delegate** — The account that receives delegated authority and can redeem it
- **Delegation scope** — Defines what actions the delegate is permitted to perform (e.g., ERC-20 transfers up to X amount)
- **Caveats/Enforcers** — Constraints applied to a delegation scope to narrow authority
- **Redelegation** — A delegation chain where a delegate passes on narrowed authority to another account

## Guides

### 1. Create a delegation

Use `createDelegation` to grant authority from a delegator to a delegate:

```ts
import { createDelegation, ScopeType, getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia as chain } from 'viem/chains'

const environment = getSmartAccountsEnvironment(chain.id)

const delegation = createDelegation({
  to: delegateAccount.address,
  from: smartAccount.address,
  environment,
  salt: '0x' + crypto.randomBytes(32).toString('hex'),
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: '0x...', // USDC on Sepolia
    maxAmount: parseUnits('100', 6),
  },
})
```

### 2. Use delegation scopes

Delegation scopes define the bounds of what a delegate can do:

```ts
// ERC-20 transfer amount scope
const erc20Scope = {
  type: ScopeType.Erc20TransferAmount,
  tokenAddress: '0x...',
  maxAmount: parseUnits('100', 6),
}

// Function call scope
const functionCallScope = {
  type: ScopeType.FunctionCall,
  to: '0x...',
  selector: '0x095ea7b3', // approve(address,uint256)
}
```

Caveats further restrict scopes:

```ts
import { CaveatType } from '@metamask/smart-accounts-kit'

const caveats = [
  {
    type: CaveatType.Erc20TransferAmount,
    tokenAddress: '0x...',
    maxAmount: parseUnits('50', 6),
  },
]
```

### 3. Check delegations

Inspect existing delegations for a smart account:

```ts
const delegations = await smartAccount.getDelegations({
  environment,
})
console.log(delegations)
```

### 4. Disable delegations

Revoke a previously granted delegation:

```ts
await smartAccount.disableDelegation({
  environment,
  delegationHash: '0x...', // the hash of the delegation to disable
})
```

### 5. Execute on a smart account's behalf

A delegate can redeem a delegation to execute transactions:

```ts
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia as chain } from 'viem/chains'

const environment = getSmartAccountsEnvironment(chain.id)

const result = await delegateAccount.executeDelegation({
  environment,
  delegation,
  calls: [
    {
      to: recipient,
      value: 0n,
      data: encodeFunctionData({ /* ... */ }),
    },
  ],
})
```

### 6. Create a redelegation

Pass narrowed authority from a delegate to another account:

```ts
const { permissionContext } = await delegateAccount.redelegatePermissionContext({
  to: subAgentAccount.address,
  environment,
  permissionContext: originalContext,
  caveats: [
    {
      type: CaveatType.Erc20TransferAmount,
      tokenAddress,
      maxAmount: parseUnits('25', 6), // further narrowed
    },
  ],
})
```

## Scope Types

| Type | Description |
|------|-------------|
| `ScopeType.Erc20TransferAmount` | Transfer up to X amount of a specific ERC-20 token |
| `ScopeType.FunctionCall` | Call a specific function on a specific contract |
| `ScopeType.Erc20TokenPeriodic` | Transfer up to X tokens per Y period |

## Caveat Types

| Type | Description |
|------|-------------|
| `CaveatType.Erc20TransferAmount` | Limits ERC-20 transfer amount |
| Various custom enforcers | Application-specific constraints |

## Resources

- [MetaMask Smart Accounts Kit — Delegation concepts](https://docs.metamask.io/smart-accounts-kit/concepts/delegation/overview/)
- [Execute on smart account's behalf guide](https://docs.metamask.io/smart-accounts-kit/guides/delegation/execute-on-smart-accounts-behalf/)
- [Delegation caveats reference](https://docs.metamask.io/smart-accounts-kit/reference/delegation/caveats/)
