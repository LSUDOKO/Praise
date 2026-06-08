'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3Auth } from '@/lib/web3auth-context';
import {
  getUSDCBalance,
  isSmartAccount,
  getOrCreateSmartAccount,
  fetchBountiesByCreator,
  CONTRACT_ADDRESSES,
  NETWORK_INFO,
} from '@/lib/smart-account-utils';
import type { BountyInfo } from '@/lib/smart-account-utils';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const { userAccount, isAuthenticated, isInitialized, login, logout, userEmail } = useWeb3Auth();
  const [balance, setBalance] = useState<string>('0');
  const [smartAccount, setSmartAccount] = useState<string | null>(null);
  const [isSmartAccountDeployed, setIsSmartAccountDeployed] = useState(false);
  const [myBounties, setMyBounties] = useState<BountyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingBounties, setFetchingBounties] = useState(false);

  // Fetch balance when account changes
  useEffect(() => {
    if (userAccount) {
      fetchBalance();
      fetchMyBounties();
    }
  }, [userAccount]);

  const fetchBalance = async () => {
    if (!userAccount) return;
    try {
      const bal = await getUSDCBalance(userAccount);
      setBalance(bal);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const fetchMyBounties = async () => {
    if (!userAccount) return;
    setFetchingBounties(true);
    try {
      const bounties = await fetchBountiesByCreator(userAccount);
      setMyBounties(bounties);
    } catch (error) {
      console.error('Error fetching bounties:', error);
    } finally {
      setFetchingBounties(false);
    }
  };

  const handleCreateSmartAccount = async () => {
    if (!userAccount) return;
    setLoading(true);
    try {
      const accountAddress = await getOrCreateSmartAccount(userAccount);
      setSmartAccount(accountAddress);

      const isSA = await isSmartAccount(accountAddress);
      setIsSmartAccountDeployed(isSA);

      // Fetch balance of Smart Account
      const saBalance = await getUSDCBalance(accountAddress);
      console.log('Smart Account balance:', saBalance);
    } catch (error) {
      console.error('Error creating Smart Account:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
    } catch (error) {
      console.error('Error logging in:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      setSmartAccount(null);
      setIsSmartAccountDeployed(false);
      setBalance('0');
      setMyBounties([]);
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-zinc-500">Initializing Web3Auth...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated state
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🏆</div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-2">
              PRaise
            </h1>
            <p className="text-zinc-500">
              Non-custodial, agentic bounties for open source
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Connecting...
                </span>
              ) : (
                'Connect with Web3Auth'
              )}
            </button>

            <p className="text-sm text-zinc-400 text-center">
              Sign up with Google, GitHub, or email
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated state
  const statusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800';
      case 'released': return 'bg-gray-100 text-gray-800';
      case 'reclaimed': return 'bg-yellow-100 text-yellow-800';
      case 'disputed': return 'bg-red-100 text-red-800';
      case 'paused': return 'bg-orange-100 text-orange-800';
      default: return 'bg-zinc-100 text-zinc-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            🏆 PRaise
          </h1>
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="text-sm text-zinc-500 hidden sm:block">{userEmail}</span>
            )}
            <button
              onClick={() => router.push('/bounties')}
              className="px-4 py-2 text-blue-600 hover:text-blue-700 transition"
            >
              Browse Bounties
            </button>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition disabled:opacity-50 text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Wallet Info */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* EOA Account */}
          <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900">Your Wallet</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Account Address</p>
                <p className="font-mono text-sm bg-zinc-50 p-2 rounded break-all mt-1">
                  {userAccount}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">USDC Balance</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{balance} <span className="text-lg font-medium text-green-500">USDC</span></p>
              </div>
            </div>
          </div>

          {/* Smart Account */}
          <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900">Smart Account</h2>
            {smartAccount ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Smart Account Address</p>
                  <p className="font-mono text-sm bg-zinc-50 p-2 rounded break-all mt-1">{smartAccount}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">Status</p>
                  <p className={`text-sm font-semibold mt-1 ${isSmartAccountDeployed ? 'text-green-600' : 'text-yellow-600'}`}>
                    {isSmartAccountDeployed ? '✓ Deployed' : '⊙ Registered'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Register your wallet for permission-scoped, automated bounty releases.
                </p>
                <button
                  onClick={handleCreateSmartAccount}
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Registering...
                    </span>
                  ) : (
                    'Register Smart Account'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>          {/* Delegation & Permissions Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🔐</span> ERC-7715 Advanced Permissions
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            Manage permissions for AI agents to automatically release bounty funds
            on your behalf. Uses ERC-7715 Advanced Permissions with the MetaMask Smart Accounts Kit.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Session Key Section */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">🛡️ Session Key</h3>
              <p className="text-xs text-amber-600 mb-3">
                Create a session key so the AI agent can auto-release bounties.
                Limited to 10 releases per day, 7-day expiry.
              </p>
              <button className="w-full bg-amber-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition">
                Create Session Key
              </button>
            </div>

            {/* Delegation Chain Section */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg p-4 border border-indigo-200">
              <h3 className="text-sm font-semibold text-indigo-800 mb-2">⛓️ Delegation Chain</h3>
              <p className="text-xs text-indigo-600 mb-3">
                Delegate release authority to the AgentDelegation contract.
                Enables gasless relayer-based payouts via 1Shot.
              </p>
              <button className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
                Configure Delegations
              </button>
            </div>
          </div>

          {/* Integration Status */}
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              SmartAccountAdapter
            </div>
            <div className="flex items-center gap-2 text-blue-600">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Venice AI Verification
            </div>
            <div className="flex items-center gap-2 text-purple-600">
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              1Shot Relayer
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <button
            onClick={() => router.push('/bounties/create')}
            className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-center group"
          >
            <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">🎯</p>
            <h3 className="font-semibold mb-1">Create Bounty</h3>
            <p className="text-sm text-blue-200">Fund a GitHub issue with USDC</p>
          </button>

          <button
            onClick={() => router.push('/bounties')}
            className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-center group"
          >
            <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">📋</p>
            <h3 className="font-semibold mb-1">Browse Bounties</h3>
            <p className="text-sm text-emerald-200">Find and contribute to open bounties</p>
          </button>

          <button
            onClick={() => router.push('/bounties')}
            className="bg-gradient-to-br from-purple-500 to-purple-700 text-white rounded-xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-center group"
          >
            <p className="text-3xl mb-2 group-hover:scale-110 transition-transform">📊</p>
            <h3 className="font-semibold mb-1">My Bounties</h3>
            <p className="text-sm text-purple-200">View your created bounties</p>
          </button>
        </div>

        {/* My Bounties */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">My Bounties</h2>
          {fetchingBounties ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : myBounties.length === 0 ? (
            <div className="text-center py-8 bg-zinc-50 rounded-lg">
              <p className="text-zinc-400">No bounties yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myBounties.map((bounty) => (
                <div
                  key={bounty.bountyAddress}
                  className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg hover:bg-blue-50 cursor-pointer transition"
                  onClick={() => router.push(`/bounties/${bounty.bountyAddress}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{bounty.repo} #{bounty.issueNumber}</p>
                    <p className="text-sm text-zinc-400 font-mono truncate">
                      {bounty.bountyAddress.slice(0, 10)}...{bounty.bountyAddress.slice(-6)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(bounty.status)}`}>
                      {bounty.status}
                    </span>
                    <span className="font-bold text-green-600">{bounty.amount} USDC</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Network Info */}
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <strong>Connected to {NETWORK_INFO.name}</strong>
          </div>
          <p className="text-xs text-blue-500 font-mono">
            Chain ID: {CONTRACT_ADDRESSES.chainId} | RPC: {CONTRACT_ADDRESSES.rpcUrl}
          </p>
          <p className="text-xs text-blue-500 font-mono mt-0.5">
            Factory: {CONTRACT_ADDRESSES.bountyFactory.slice(0, 10)}...{CONTRACT_ADDRESSES.bountyFactory.slice(-6)}
            &nbsp;|&nbsp; USDC: {CONTRACT_ADDRESSES.usdc.slice(0, 10)}...{CONTRACT_ADDRESSES.usdc.slice(-6)}
          </p>
        </div>
      </div>
    </div>
  );
}
