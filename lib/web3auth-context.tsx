"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Web3Auth } from "@web3auth/modal";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type Web3AuthUserInfo = {
  email?: string;
  name?: string;
  profileImage?: string;
};

type Web3AuthInstance = Web3Auth & {
  provider?: Eip1193Provider | null;
  getUserInfo?: () => Promise<Web3AuthUserInfo>;
};

type Web3AuthConnection = Eip1193Provider & {
  ethereumProvider?: Eip1193Provider;
};

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 421614;
const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "";
const WEB3AUTH_NETWORK =
  process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || "sapphire_devnet";

const CHAIN_CONFIG = {
  chainNamespace: "eip155" as const,
  chainId: `0x${CHAIN_ID.toString(16)}`,
  rpcTarget: RPC_URL,
  displayName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Arbitrum Sepolia",
  blockExplorerUrl:
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || "https://sepolia.arbiscan.io",
  ticker: process.env.NEXT_PUBLIC_NATIVE_TICKER || "ETH",
  tickerName: process.env.NEXT_PUBLIC_NATIVE_TICKER_NAME || "Ethereum",
};

type Web3AuthContextType = {
  isInitialized: boolean;
  isAuthenticated: boolean;
  initializationError: string | null;
  userAccount: string | null;
  userEmail: string | null;
  provider: Eip1193Provider | null;
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const Web3AuthContext = createContext<Web3AuthContextType | undefined>(
  undefined,
);

async function resolveAccount(
  provider: Eip1193Provider,
): Promise<string | null> {
  const accounts = await provider.request({ method: "eth_accounts" });
  if (Array.isArray(accounts) && typeof accounts[0] === "string") {
    return accounts[0].toLowerCase();
  }
  return null;
}

export const Web3AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [web3auth, setWeb3auth] = useState<Web3AuthInstance | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [userAccount, setUserAccount] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);

  useEffect(() => {
    let cancelled = false;

    const markInitialized = () => {
      if (!cancelled) setIsInitialized(true);
    };

    const init = async () => {
      if (!CLIENT_ID) {
        setInitializationError(
          "NEXT_PUBLIC_WEB3AUTH_CLIENT_ID is not configured",
        );
        markInitialized();
        return;
      }

      try {
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: { chainConfig: CHAIN_CONFIG },
        });

        const instance = new Web3Auth({
          clientId: CLIENT_ID,
          web3AuthNetwork: WEB3AUTH_NETWORK,
          privateKeyProvider,
          uiConfig: {
            appName: "PRaise",
            defaultLanguage: "en",
            theme: { primary: "#2563eb" },
            mode: "light",
          },
          authMode: "DAPP",
        } as unknown as ConstructorParameters<
          typeof Web3Auth
        >[0]) as Web3AuthInstance;

        await instance.init();
        if (cancelled) return;

        setWeb3auth(instance);
        const restoredProvider = instance.provider || null;
        if (restoredProvider) {
          setProvider(restoredProvider);
          setUserAccount(await resolveAccount(restoredProvider));
          const info = await instance.getUserInfo?.();
          setUserEmail(info?.email || null);
        }
        markInitialized();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setInitializationError(message);
        console.error("Web3Auth initialization error:", error);
        markInitialized();
      }
    };

    void init();

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason);
      if (
        reason.includes("farcaster") ||
        reason.includes("Invalid auth connection")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      cancelled = true;
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  const login = useCallback(async (): Promise<string | null> => {
    if (!web3auth) return null;

    try {
      const connection =
        (await web3auth.connect()) as Web3AuthConnection | null;
      if (!connection) return null;

      const ethProvider = connection.ethereumProvider || connection;
      const accounts = await ethProvider.request({
        method: "eth_requestAccounts",
      });
      const account =
        Array.isArray(accounts) && typeof accounts[0] === "string"
          ? accounts[0].toLowerCase()
          : null;
      if (!account) return null;

      setProvider(ethProvider);
      setUserAccount(account);

      const userInfo = await web3auth.getUserInfo?.();
      setUserEmail(userInfo?.email || null);

      return account;
    } catch (error) {
      console.error("Login error:", error);
      return null;
    }
  }, [web3auth]);

  const logout = useCallback(async (): Promise<void> => {
    if (!web3auth) return;
    try {
      await web3auth.logout();
    } finally {
      setProvider(null);
      setUserAccount(null);
      setUserEmail(null);
    }
  }, [web3auth]);

  const value = useMemo<Web3AuthContextType>(
    () => ({
      isInitialized,
      isAuthenticated: Boolean(userAccount),
      initializationError,
      userAccount,
      userEmail,
      provider,
      login,
      logout,
    }),
    [
      initializationError,
      isInitialized,
      login,
      logout,
      provider,
      userAccount,
      userEmail,
    ],
  );

  return (
    <Web3AuthContext.Provider value={value}>
      {children}
    </Web3AuthContext.Provider>
  );
};

export const useWeb3Auth = () => {
  const context = useContext(Web3AuthContext);
  if (context === undefined) {
    throw new Error("useWeb3Auth must be used within Web3AuthProvider");
  }
  return context;
};
