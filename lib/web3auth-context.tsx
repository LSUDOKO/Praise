'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

// --- Config ---
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 421614;
const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || '';

const CHAIN_CONFIG = {
  chainNamespace: 'eip155' as const,
  chainId: '0x' + CHAIN_ID.toString(16),
  rpcTarget: RPC_URL,
  displayName: 'Arbitrum Sepolia',
  blockExplorerUrl: 'https://sepolia.arbiscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
};

// --- Types ---
type Web3AuthContextType = {
  isInitialized: boolean;
  isAuthenticated: boolean;
  userAccount: string | null;
  userEmail: string | null;
  /**
   * ethers JsonRpcSigner wrapping Web3Auth's EIP-1193 provider.
   * Uses the Sapphire smart account infrastructure under the hood —
   * transactions are bundled as UserOps by Web3Auth's bundler.
   * The chain is configured to Arbitrum Sepolia via EthereumPrivateKeyProvider.
   */
  signer: JsonRpcSigner | null;
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const Web3AuthContext = createContext<Web3AuthContextType | undefined>(undefined);

// --- Provider Component ---
export const Web3AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userAccount, setUserAccount] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);

  // Initialize Web3Auth
  useEffect(() => {
    const init = async () => {
      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig: CHAIN_CONFIG },
        });

        const w3a = new Web3Auth({
          clientId: CLIENT_ID,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider,
          uiConfig: {
            appName: 'PRaise',
            defaultLanguage: 'en',
            theme: {
              primary: '#2563eb',
            },
            mode: 'light',
          },
        } as any);

        setWeb3auth(w3a);
        await w3a.init();
        setIsInitialized(true);
      } catch (error) {
        console.error('Web3Auth initialization error:', error);
        setIsInitialized(true);
      }
    };

    if (CLIENT_ID) {
      init();
    } else {
      console.warn('NEXT_PUBLIC_WEB3AUTH_CLIENT_ID not set');
      setIsInitialized(true);
    }
  }, []);

  const login = useCallback(async (): Promise<string | null> => {
    if (!web3auth) return null;

    try {
      const connection = await web3auth.connect();
      if (!connection) return null;

      // Get the EIP-1193 provider from the connection
      const ethProvider = (connection as any).ethereumProvider || connection;

      // Use BrowserProvider wrapping Web3Auth's provider for signing.
      // Web3Auth Sapphire (sapphire_devnet) uses ERC-4337 smart accounts,
      // which don't expose a private key. Instead, we create an ethers-compatible
      // signer from the Web3Auth EIP-1193 provider.
      // The chain is configured via EthereumPrivateKeyProvider above.
      const browserProvider = new BrowserProvider(ethProvider);

      // Get the user's address first
      const accounts: string[] = await ethProvider.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0]?.toLowerCase() || null;
      if (!account) return null;

      // Get signer by known address — this skips the eth_accounts call
      // that would fail with Web3Auth's AA provider
      const ethersSigner = await browserProvider.getSigner(account);
      setSigner(ethersSigner);
      setUserAccount(account);

      // Get user info
      try {
        const userInfo = await (web3auth as any).getUserInfo();
        if (userInfo?.email) setUserEmail(userInfo.email);
      } catch {
        // ignore
      }

      return account;
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  }, [web3auth]);

  const logout = useCallback(async (): Promise<void> => {
    if (!web3auth) return;
    try {
      await web3auth.logout();
      setSigner(null);
      setUserAccount(null);
      setUserEmail(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [web3auth]);

  return (
    <Web3AuthContext.Provider
      value={{
        isInitialized,
        isAuthenticated: !!userAccount,
        userAccount,
        userEmail,
        signer,
        login,
        logout,
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
};

export const useWeb3Auth = () => {
  const context = useContext(Web3AuthContext);
  if (context === undefined) {
    throw new Error('useWeb3Auth must be used within Web3AuthProvider');
  }
  return context;
};
