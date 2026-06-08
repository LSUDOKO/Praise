'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3Auth } from '@/lib/web3auth-context';
import { useRouter } from 'next/navigation';
import { fetchAllBounties } from '@/lib/smart-account-utils';
import type { BountyInfo } from '@/lib/smart-account-utils';

export default function BountiesPage() {
  const router = useRouter();
  const { isAuthenticated } = useWeb3Auth();
  const [bounties, setBounties] = useState<BountyInfo[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBounties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllBounties();
      setBounties(data);
    } catch (err) {
      console.error('Error loading bounties:', err);
      setError('Failed to load bounties. Please check your wallet connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBounties();
  }, [loadBounties]);

  const filteredBounties =
    filterStatus === 'all'
      ? bounties
      : bounties.filter((b) => b.status === filterStatus);

  const statusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'released':
      case 'paid':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'reclaimed':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'disputed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'paused':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-zinc-100 text-zinc-800 border-zinc-200';
    }
  };

  const SHORTENED_STATUSES = ['open', 'released', 'reclaimed', 'disputed', 'paused'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              📋 Bounties
            </h1>
            {bounties.length > 0 && (
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                {bounties.length} total
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <button
                onClick={() => router.push('/bounties/create')}
                className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:shadow-lg hover:from-green-600 hover:to-emerald-700 transition-all"
              >
                + Create Bounty
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-900 transition"
            >
              Dashboard
            </button>
            <button
              onClick={loadBounties}
              disabled={loading}
              className="px-3 py-2 text-blue-600 hover:text-blue-700 transition disabled:opacity-50"
            >
              {loading ? '⟳' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={loadBounties} className="text-sm underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-8">
          <div className="flex gap-2 flex-wrap">
            {['all', ...SHORTENED_STATUSES].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Bounties List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-zinc-500">Loading bounties from Arbitrum Sepolia...</p>
          </div>
        ) : filteredBounties.length === 0 ? (
          <div className="text-center py-20 bg-white/50 backdrop-blur-sm rounded-2xl border border-dashed border-zinc-300">
            <p className="text-zinc-500 text-lg mb-2">No bounties found</p>
            <p className="text-zinc-400 text-sm mb-6">
              {filterStatus !== 'all'
                ? `No bounties with status "${filterStatus}"`
                : 'Be the first to create a bounty!'}
            </p>
            {isAuthenticated && (
              <button
                onClick={() => router.push('/bounties/create')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Create the First Bounty
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredBounties.map((bounty) => (
              <div
                key={bounty.bountyAddress}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all p-6 cursor-pointer border border-zinc-100 hover:border-blue-200"
                onClick={() => router.push(`/bounties/${bounty.bountyAddress}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <svg className="w-5 h-5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <h3 className="text-xl font-semibold truncate">{bounty.repo}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColor(bounty.status)}`}>
                        {bounty.status}
                      </span>
                    </div>
                    <p className="text-zinc-500 mb-2">
                      Issue #{bounty.issueNumber}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      <span className="truncate font-mono">ID: {bounty.bountyId}</span>
                      {bounty.contributor && bounty.contributor !== '0x0000000000000000000000000000000000000000' && (
                        <span>Contributor: {bounty.contributor.slice(0, 6)}...{bounty.contributor.slice(-4)}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-3xl font-bold text-green-600">{bounty.amount}</p>
                    <p className="text-sm text-zinc-400">USDC</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-mono">Contract: {bounty.bountyAddress.slice(0, 10)}...{bounty.bountyAddress.slice(-6)}</span>
                  <span>Creator: {bounty.creator.slice(0, 6)}...{bounty.creator.slice(-4)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Network Info */}
        <div className="mt-8 bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <strong>Live on Arbitrum Sepolia</strong>
          </div>
          <p className="text-blue-500 text-xs font-mono">
            Registry: 0x76090E4943910F41290Aa4eC0c63B7F3aB6b6241 &nbsp;|&nbsp; 
            Factory: 0x2cf9b3bC314504E4CA30eED0C527256Ea76fddc5
          </p>
        </div>
      </div>
    </div>
  );
}
