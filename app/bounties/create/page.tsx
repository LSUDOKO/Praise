'use client';

import React, { useState } from 'react';
import { useWeb3Auth } from '@/lib/web3auth-context';
import { createBountyWithFunding, CONTRACT_ADDRESSES, NETWORK_INFO } from '@/lib/smart-account-utils';
import { useRouter } from 'next/navigation';

export default function CreateBountyPage() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useWeb3Auth();

  const [step, setStep] = useState<'connect' | 'repo' | 'issue' | 'review' | 'confirming'>('connect');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<string[]>([]);

  // Form state
  const [repoUrl, setRepoUrl] = useState('');
  const [parsedRepo, setParsedRepo] = useState<string>('');
  const [issueNumber, setIssueNumber] = useState('');
  const [bountyAmount, setBountyAmount] = useState('');
  const [contestPeriodDays, setContestPeriodDays] = useState('7');

  // Handle auth gate
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-zinc-500">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-5xl mb-4">🔐</p>
          <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
          <p className="text-zinc-500 mb-6">You need to connect your wallet to create a bounty.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleParseRepo = () => {
    setError(null);
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    // Extract owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$|\.git)/);
    if (!match) {
      setError('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)');
      return;
    }

    setParsedRepo(match[1]);
    setStep('issue');
  };

  const validateIssue = () => {
    setError(null);
    const issueNum = parseInt(issueNumber);
    if (!issueNum || issueNum < 1) {
      setError('Please enter a valid issue number');
      return;
    }
    setStep('review');
  };

  const handleCreateBounty = async () => {
    if (!parsedRepo || !issueNumber || !bountyAmount) {
      setError('Please fill in all required fields');
      return;
    }

    const amount = parseFloat(bountyAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid bounty amount');
      return;
    }

    setLoading(true);
    setError(null);
    setStep('confirming');

    try {
      const contestPeriodSeconds = parseInt(contestPeriodDays) * 24 * 60 * 60;

      const result = await createBountyWithFunding(
        parsedRepo,
        parseInt(issueNumber),
        bountyAmount,
        contestPeriodSeconds
      );

      setTxHashes(result.txHashes);

      // Success — navigate to bounties after a short delay
      setTimeout(() => {
        router.push('/bounties');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setStep('review');
      console.error('Error creating bounty:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            🎯 Create Bounty
          </h1>
          <button
            onClick={() => router.push('/bounties')}
            className="px-4 py-2 text-zinc-600 hover:text-zinc-900 transition"
          >
            ← Back
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {step === 'confirming' && txHashes.length > 0 && !error && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-green-800">
            <div className="text-center">
              <p className="text-4xl mb-2">✅</p>
              <h3 className="text-xl font-bold mb-2">Bounty Created Successfully!</h3>
              <p className="text-sm text-green-600 mb-4">Redirecting to bounties...</p>
              <div className="space-y-1">
                {txHashes.map((hash, i) => (
                  <p key={i} className="text-xs font-mono">
                    Tx {i + 1}: {hash.slice(0, 10)}...{hash.slice(-6)}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-4">
          {/* Stepper */}
          <div className="flex items-center gap-2 mb-6">
            {['connect', 'repo', 'issue', 'review'].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-2 ${
                  step === s ? 'text-blue-600' : 
                  ['confirming'].includes(step) && ['connect', 'repo', 'issue', 'review'].indexOf(s) < 4 ? 'text-green-600' : 'text-zinc-400'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                    step === s ? 'border-blue-600 bg-blue-50' :
                    (step === 'confirming' && ['connect', 'repo', 'issue', 'review'].indexOf(s) < 4) ? 'border-green-600 bg-green-50' :
                    'border-zinc-300'
                  }`}>
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium hidden sm:block capitalize">
                    {s === 'connect' ? 'Start' : s}
                  </span>
                </div>
                {i < 3 && <div className="flex-1 h-px bg-zinc-300" />}
              </React.Fragment>
            ))}
          </div>

          {/* Step: Connect (already handled above) */}

          {/* Step: Repo URL */}
          <div className={`bg-white rounded-xl shadow-sm border border-zinc-200 p-6 transition-all ${
            step === 'repo' ? 'ring-2 ring-blue-500' : step === 'confirming' ? 'opacity-50' : ''
          }`}>
            <h2 className="text-lg font-semibold mb-4">Step 1: Repository</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  GitHub Repository URL
                </label>
                <input
                  type="text"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={step !== 'repo'}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  The repository where the issue is located
                </p>
              </div>
              <button
                onClick={handleParseRepo}
                disabled={!repoUrl.trim() || step !== 'repo'}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </div>

          {/* Step: Issue */}
          <div className={`bg-white rounded-xl shadow-sm border border-zinc-200 p-6 transition-all ${
            step === 'issue' ? 'ring-2 ring-blue-500' : step === 'confirming' ? 'opacity-50' : ''
          }`}>
            <h2 className="text-lg font-semibold mb-4">Step 2: Issue</h2>
            <div className="space-y-4">
              {parsedRepo && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  Repo: <strong>{parsedRepo}</strong>
                  <button
                    onClick={() => setStep('repo')}
                    className="ml-2 text-blue-500 underline hover:no-underline"
                    disabled={step !== 'issue'}
                  >
                    Change
                  </button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Issue Number
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 42"
                  value={issueNumber}
                  onChange={(e) => setIssueNumber(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={step !== 'issue'}
                />
              </div>
              <button
                onClick={validateIssue}
                disabled={!issueNumber || step !== 'issue'}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </div>

          {/* Step: Review & Confirm */}
          <div className={`bg-white rounded-xl shadow-sm border border-zinc-200 p-6 transition-all ${
            step === 'review' ? 'ring-2 ring-blue-500' : step === 'confirming' ? 'opacity-50' : ''
          }`}>
            <h2 className="text-lg font-semibold mb-4">Step 3: Review & Fund</h2>
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-zinc-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Repository</span>
                  <span className="font-medium">{parsedRepo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Issue #</span>
                  <span className="font-medium">{issueNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Bounty Amount</span>
                  <span className="font-bold text-green-600">{bountyAmount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Contest Period</span>
                  <span className="font-medium">{contestPeriodDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Agent</span>
                  <span className="font-mono text-xs">
                    {CONTRACT_ADDRESSES.agentDelegation.slice(0, 10)}...
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Bounty Amount (USDC)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="100"
                  value={bountyAmount}
                  onChange={(e) => setBountyAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={step !== 'review'}
                />
              </div>

              {/* Contest Period */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Contest Period (days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={contestPeriodDays}
                  onChange={(e) => setContestPeriodDays(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={step !== 'review'}
                />
              </div>

              {/* Info */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p><strong>⚠️ This is a real on-chain transaction on {NETWORK_INFO.name}.</strong></p>
                <p className="mt-1">Your wallet will be prompted to:</p>
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  <li>Create the bounty contract</li>
                  <li>Approve USDC spending</li>
                  <li>Deposit USDC into the bounty</li>
                </ol>
                <p className="mt-1">You need at least {bountyAmount || 'N/A'} USDC on Arbitrum Sepolia.</p>
              </div>

              <button
                onClick={handleCreateBounty}
                disabled={!bountyAmount || loading || step === 'confirming'}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:from-green-600 hover:to-emerald-700 transition disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                    {txHashes.length === 0 ? 'Creating Bounty...' : 'Funding Bounty...'}
                  </span>
                ) : (
                  '✅ Create & Fund Bounty'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Network Info */}
        <div className="mt-6 bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
          <p><strong>Network:</strong> {NETWORK_INFO.name}</p>
          <p className="mt-0.5 font-mono">
            USDC: {CONTRACT_ADDRESSES.usdc} | Chain: {CONTRACT_ADDRESSES.chainId}
          </p>
        </div>
      </div>
    </div>
  );
}
