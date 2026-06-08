/**
 * The stable, versioned derivation label for WebAuthn PRF.
 * WARNING: Changing this value after users register will change their derived private keys
 * and cause them to lose access to their wallets forever.
 */
export const ETH_KEY_DERIVATION_LABEL = "com.praise.eth-key-v1";
