# Create a redelegation

Redelegation is a core feature that sets [Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#advanced-permissions)**Advanced Permissions** Fine-grained, wallet execution permissions that dapps can request from MetaMask extension users. Based on ERC-7715. apart from other permission sharing frameworks.
It allows a session account ([delegate](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#delegate-account)**Delegate account** The account that receives delegated authority and can redeem a delegation under its constraints.) to create a delegation chain, passing on the same or reduced level of authority
from the MetaMask account ([delegator](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#delegator-account)**Delegator account** The account that creates and signs a delegation to grant limited authority to another account.).

For example, if a dapp is granted permission to spend 10 USDC on a user's behalf, it can
further delegate that permission to specific agents, such as allowing a Swap agent to spend
up to 5 USDC. This creates a permission sharing chain in which the root permissions are
shared with additional parties.


## Prerequisites​

- [Install and set up the Smart Accounts Kit.](https://docs.metamask.io/smart-accounts-kit/get-started/install/)
- [Learn about Advanced Permissions.](https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/)
- [Learn how to request Advanced Permissions.](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/execute-on-metamask-users-behalf/)


## Request Advanced Permissions​

Request Advanced Permissions from the user with the Wallet Client's [requestExecutionPermissions](https://docs.metamask.io/smart-accounts-kit/reference/advanced-permissions/wallet-client/#requestexecutionpermissions) action.

This example uses the [ERC-20 periodic permission](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/use-permissions/erc20-token/#erc-20-periodic-permission), allowing the
user to grant dapp the ability to spend 10 USDC on their behalf.

```
import { sepolia as chain } from 'viem/chains'

import { sessionAccount, walletClient, tokenAddress } from './config.ts'

import { parseUnits } from 'viem'



// Since current time is in seconds, we need to convert milliseconds to seconds.

const currentTime = Math.floor(Date.now() / 1000)

// 1 week from now.

const expiry = currentTime + 604800



const grantedPermissions = await walletClient.requestExecutionPermissions([

  {

    chainId: chain.id,

    expiry,

    // The requested permissions will granted to the

    // session account.

    to: sessionAccount.address,

    permission: {

      type: 'erc20-token-periodic',

      data: {

        tokenAddress,

        // 10 USDC in wei format. Since USDC has 6 decimals, 10 * 10^6

        periodAmount: parseUnits('10', 6),

        // 1 day in seconds

        periodDuration: 86400,

        justification: 'Permission to transfer 10 USDC every day',

      },

      isAdjustmentAllowed: true,

    },

  },

])

```


## Create a redelegation​

Create a [redelegation](https://docs.metamask.io/smart-accounts-kit/concepts/delegation/overview/#redelegation) from dapp to a Swap agent.

To create a redelegation, provide the granted permission context as the `permissionContext` argument when calling [redelegatePermissionContext](https://docs.metamask.io/smart-accounts-kit/reference/erc7710/wallet-client/#redelegatepermissioncontext).
In the previous step, `sessionAccount` was extended with `erc7710WalletActions`.

When you create a redelegation, apply the toolkit's [caveats](https://docs.metamask.io/smart-accounts-kit/reference/delegation/caveats/)
to narrow the Swap agent's authority. In this example, we'll use [erc20TransferAmount](https://docs.metamask.io/smart-accounts-kit/reference/delegation/caveats/#erc20transferamount)
enforcer, allowing your dapp to delegate the Swap agent only the ability to spend 5 USDC on the user's behalf.

When creating a redelegation, you can only narrow the scope of the original authority, not expand it.

```
import { sessionAccount, agentAccount, tokenAddress } from './config.ts'

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

    // USDC has 6 decimal places.

    maxAmount: parseUnits('5', 6),

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

