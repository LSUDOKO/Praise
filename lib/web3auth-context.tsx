'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { Wallet, JsonRpcProvider } from 'ethers';

// --- Config ---
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 421614;
const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || '';

// --- Types ---
type Web3AuthContextType = {
  isInitialized: boolean;
  isAuthenticated: boolean;
  userAccount: string | null;
  userEmail: string | null;
  /**
   * ethers Wallet connected directly to Arbitrum Sepolia via JsonRpcProvider.
   * This bypasses Web3Auth's chain routing (which forces Ethereum Sepolia)
   * by extracting the private key and connecting to our own RPC endpoint.
   */
  signer: Wallet | null;
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
  const [signer, setSigner] = useState<Wallet | null>(null);

  // Initialize Web3Auth
  useEffect(() => {
    const init = async () => {
      try {
        const w3a = new Web3Auth({
          clientId: CLIENT_ID,
          web3AuthNetwork: 'sapphire_devnet',
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

      // Extract private key and create a Wallet connected to Arbitrum Sepolia.
      // This bypasses Web3Auth's Infura proxy (which forces Ethereum Sepolia)
      // and connects us directly to our chosen RPC endpoint.
      let privateKey: string | null = null;
      try {
        privateKey = await ethProvider.request({ method: 'eth_private_key' });
      } catch (e) {
        console.error('Failed to get private key from Web3Auth:', e);
        return null;
      }

      if (!privateKey) return null;

      const rpcProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
      const wallet = new Wallet(privateKey, rpcProvider);
      setSigner(wallet);

      const account = wallet.address.toLowerCase();
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
