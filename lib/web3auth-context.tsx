'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';

// --- Config ---
const chainIdHex = process.env.NEXT_PUBLIC_CHAIN_ID
  ? '0x' + Number(process.env.NEXT_PUBLIC_CHAIN_ID).toString(16)
  : '0x66eee';

const CHAIN_CONFIG = {
  chainNamespace: 'eip155' as const,
  chainId: chainIdHex,
  rpcTarget: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
  displayName: 'Arbitrum Sepolia',
  blockExplorer: 'https://sepolia.arbiscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
};

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || '';

// --- Types ---
type Web3AuthContextType = {
  isInitialized: boolean;
  isAuthenticated: boolean;
  userAccount: string | null;
  userEmail: string | null;
  provider: any;
  web3auth: Web3Auth | null;
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
  getPrivateKey: () => Promise<string | null>;
};

const Web3AuthContext = createContext<Web3AuthContextType | undefined>(undefined);

// --- Provider Component ---
export const Web3AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userAccount, setUserAccount] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Initialize Web3Auth
  useEffect(() => {
    const init = async () => {
      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig: CHAIN_CONFIG },
        } as any);

        const w3a = new Web3Auth({
          clientId: CLIENT_ID,
          web3AuthNetwork: 'sapphire_devnet',
          privateKeyProvider: privateKeyProvider as any,
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
      console.warn('NEXT_PUBLIC_WEB3AUTH_CLIENT_ID not set — Web3Auth not initialized');
      setIsInitialized(true);
    }
  }, []);

  const login = useCallback(async (): Promise<string | null> => {
    if (!web3auth) return null;

    try {
      const connection = await web3auth.connect();
      if (!connection) return null;

      // v11: connection has ethereumProvider property
      const ethProvider = (connection as any).ethereumProvider || connection;
      setProvider(ethProvider);

      let account: string | null = null;
      try {
        const accounts = await ethProvider.request({ method: 'eth_accounts' }) as string[];
        account = accounts?.[0]?.toLowerCase() || null;
        if (account) setUserAccount(account);
      } catch (e) {
        console.warn('Could not get accounts after login:', e);
      }

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
      setProvider(null);
      setUserAccount(null);
      setUserEmail(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [web3auth]);

  const getPrivateKey = useCallback(async (): Promise<string | null> => {
    if (!provider) return null;
    try {
      const privateKey = await provider.request({
        method: 'eth_private_key',
      });
      return privateKey as string;
    } catch {
      return null;
    }
  }, [provider]);

  return (
    <Web3AuthContext.Provider
      value={{
        isInitialized,
        isAuthenticated: !!userAccount,
        userAccount,
        userEmail,
        provider,
        web3auth,
        login,
        logout,
        getPrivateKey,
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
