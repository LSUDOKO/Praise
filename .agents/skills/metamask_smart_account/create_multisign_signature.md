# Generate a multisig signature

The Smart Accounts Kit supports [Multisig smart accounts](https://docs.metamask.io/smart-accounts-kit/concepts/smart-accounts/#multisig-smart-account),
allowing you to add multiple [EOA](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#externally-owned-account-eoa)**Externally owned account (EOA)** A private-key-controlled account with no built-in programmable execution logic.
[signers](https://docs.metamask.io/smart-accounts-kit/development/reference/glossary#signer)**Signer** An account that can sign transactions for a smart account. with a configurable execution threshold. When the threshold
is greater than 1, you can collect signatures from the required signers
and use the [aggregateSignature](https://docs.metamask.io/smart-accounts-kit/reference/smart-account/#aggregatesignature) function to combine them
into a single aggregated signature.


## Prerequisites​

- [Install and set up the Smart Accounts Kit.](https://docs.metamask.io/smart-accounts-kit/get-started/install/)
- [Create a Multisig smart account.](https://docs.metamask.io/smart-accounts-kit/guides/smart-accounts/create-smart-account/#multisig-smart-account)


## Generate a multisig signature​

The following example configures a Multisig smart account with two different signers: Alice
and Bob. The account has a threshold of 2, meaning that signatures from
both parties are required for any execution.

```
import {

  bundlerClient,

  aliceSmartAccount,

  bobSmartAccount,

  aliceAccount,

  bobAccount,

} from './config.ts'

import { aggregateSignature } from '@metamask/smart-accounts-kit'



const userOperation = await bundlerClient.prepareUserOperation({

  account: aliceSmartAccount,

  calls: [

    {

      target: zeroAddress,

      value: 0n,

      data: '0x',

    },

  ],

})



const aliceSignature = await aliceSmartAccount.signUserOperation(userOperation)

const bobSignature = await bobSmartAccount.signUserOperation(userOperation)



const aggregatedSignature = aggregateSignature({

  signatures: [

    {

      signer: aliceAccount.address,

      signature: aliceSignature,

      type: 'ECDSA',

    },

    {

      signer: bobAccount.address,

      signature: bobSignature,

      type: 'ECDSA',

    },

  ],

})

```

