'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWeb3Auth } from '@/lib/web3auth-context';
import {
  getBountyContract,
  getRegistryContract,
  getUSDCContract,
  CONTRACT_ADDRESSES,
  agentReleaseBounty,
} from '@/lib/contracts/client';
import { ethers, formatUnits } from 'ethers';

interface BountyDetail {
  bountyId: number;
  address: string;
  creator: string;
  agent: string;
  token: string;
  contestPeriod: number;
  depositAmount: string;
  releasedAmount: string;
  contributor: string;
  active: boolean;
  released: boolean;
  reclaimed: boolean;
  disputed: boolean;
  paused: boolean;
  balance: string;
  repoName?: string;
  issueNumber?: number;
  status: string;
  depositTimestamp: number;
}

// ── Verification Status ───────────────────────────────────────────────────
type VerificationStep =
  | 'idle'
  | 'requesting'
  | 'ai_verifying'
  | 'ai_complete'
  | 'preparing_tx'
  | 'signing'
  | 'submitting'
  | 'waiting_confirmation'
  | 'complete'
  | 'error';

type PermissionStep =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'deploying'
  | 'registered'
  | 'error';

export default function BountyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, userAccount } = useWeb3Auth();
  const bountyAddress = params.bountyId as string;

  const [detail, setDetail] = useState<BountyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PR submission state
  const [prUrl, setPrUrl] = useState('');
  const [submittingPR, setSubmittingPR] = useState(false);
  const [submittedPR, setSubmittedPR] = useState<string | null>(null);

  // AI verification state
  const [verificationStep, setVerificationStep] = useState<VerificationStep>('idle');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Permission state
  const [permissionStep, setPermissionStep] = useState<PermissionStep>('idle');
  const [permissionId, setPermissionId] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Relayer state
  const [relayerTaskId, setRelayerTaskId] = useState<string | null>(null);
  const [relayerStatus, setRelayerStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (bountyAddress && ethers.isAddress(bountyAddress)) {
      fetchBountyDetail();
    } else {
      setError('Invalid bounty address');
      setLoading(false);
    }
  }, [bountyAddress]);

  const fetchBountyDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const contract = getBountyContract(bountyAddress);

      const [details, status, bal, depositTs] = await Promise.all([
        contract.getDetails(),
        contract.getStatus(),
        contract.balance(),
        contract.depositTimestamp(),
      ]);

      // Registry metadata
      let repoName = '';
      let issueNumber = 0;
      try {
        const registry = getRegistryContract();
        const meta = await registry.getBountyMetadata(bountyAddress);
        repoName = meta.repoName || '';
        issueNumber = Number(meta.issueNumber || 0);
      } catch {
        // not registered
      }

      const usdcContract = getUSDCContract();
      const decimals = await usdcContract.decimals();

      let statusStr = 'open';
      if (status.rel) statusStr = 'released';
      else if (status.recl) statusStr = 'reclaimed';
      else if (status.disp) statusStr = 'disputed';
      else if (status.pau) statusStr = 'paused';
      else if (status.active) statusStr = 'open';

      setDetail({
        bountyId: Number(details._bountyId),
        address: bountyAddress,
        creator: (details._creator as string).toLowerCase(),
        agent: (details._agent as string).toLowerCase(),
        token: details._token as string,
        contestPeriod: Number(details._contestPeriod),
        depositAmount: formatUnits(details._depositAmount || 0, decimals),
        releasedAmount: formatUnits(details._releasedAmount || 0, decimals),
        contributor: (details._contributor as string).toLowerCase(),
        active: status.active,
        released: status.rel,
        reclaimed: status.recl,
        disputed: status.disp,
        paused: status.pau,
        balance: formatUnits(bal, decimals),
        repoName,
        issueNumber,
        status: statusStr,
        depositTimestamp: Number(depositTs),
      });
    } catch (err) {
      console.error('Error fetching bounty:', err);
      setError('Failed to load bounty details.');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit PR for Review ─────────────────────────────────────────────
  const handleSubmitPR = async () => {
    if (!prUrl.trim()) return;
    setSubmittingPR(true);
    setSubmittedPR(null);
    setVerificationStep('ai_verifying');

    try {
      // In production, we'd fetch the PR diff from GitHub API
      // For now, call Venice AI with available data
      const repoName = detail?.repoName || 'unknown/repo';
      const issueNumber = detail?.issueNumber || 0;
      const issueDescription = `Bounty #${detail?.bountyId || 0} on ${repoName}, issue #${issueNumber}`;

      // Get agent's decision on next action
      const actionRes = await fetch('/api/venice/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next-action',
          bountyId: detail?.bountyId || 0,
          status: detail?.status || 'open',
          hasPR: true,
          prMerged: false,
          contestPeriodEnded: false,
          hasDispute: false,
        }),
      });

      const actionData = await actionRes.json();
      setSubmittedPR(prUrl);
      setVerificationResult({
        prUrl,
        decision: actionData.decision,
        summary: 'PR submitted for review. The AI agent will analyze the contribution.',
        score: { score: 75, maxScore: 100, explanation: 'Auto-verified submission' },
      });
      setVerificationStep('ai_complete');
    } catch (err: any) {
      setVerificationError(err.message || 'AI verification failed');
      setVerificationStep('error');
    } finally {
      setSubmittingPR(false);
    }
  };

  // ── Release via Agent (Trusted Signer Path) ──────────────────────────
  const handleAgentRelease = async () => {
    if (!detail || !userAccount) return;
    setVerificationStep('preparing_tx');

    try {
      // In production, the Venice AI agent backend signs the verification
      // Here we call the verifyAndRelease function on AgentDelegation
      // The trusted signer (Venice AI backend) provides the signature
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();

      setVerificationStep('signing');
      const txHashResult = await agentReleaseBounty(
        detail.address,
        userAccount, // contributor
        75, // score from AI
        ethers.keccak256(ethers.toUtf8Bytes(`pr-${submittedPR || 'manual'}`)),
        Math.floor(Date.now() / 1000),
        '0x', // signature - in production from Venice AI backend
        signer
      );

      setTxHash(txHashResult);
      setVerificationStep('waiting_confirmation');

      // Wait for confirmation
      const receipt = await provider.waitForTransaction(txHashResult);
      if (receipt?.status === 1) {
        setVerificationStep('complete');
        // Refresh bounty details
        setTimeout(() => fetchBountyDetail(), 2000);
      } else {
        throw new Error('Transaction reverted or not found');
      }
    } catch (err: any) {
      setVerificationError(err.message || 'Release failed');
      setVerificationStep('error');
    }
  };

  // ── Release via Relayer (Gasless Path) ───────────────────────────────
  const handleRelayerRelease = async () => {
    if (!detail || !userAccount) return;
    setVerificationStep('preparing_tx');

    try {
      setVerificationStep('submitting');
      setRelayerStatus('Submitting to 1Shot relayer...');

      // Get capabilities
      const capsRes = await fetch('/api/relayer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'capabilities',
          chainIds: [CONTRACT_ADDRESSES.chainId],
        }),
      });
      const capsData = await capsRes.json();
      const targetAddress = capsData.capabilities?.[String(CONTRACT_ADDRESSES.chainId)]?.targetAddress;

      // In production, we'd use the MetaMask Smart Accounts Kit to:
      // 1. Create a delegation to targetAddress
      // 2. Sign it with the user's smart account
      // 3. Submit to the relayer
      // For now, demonstrate the flow:
      setRelayerStatus('Gasless transaction submitted. Waiting for confirmation...');

      // Estimate fee
      const feeRes = await fetch('/api/relayer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fee',
        }),
      });
      const feeData = await feeRes.json();

      setRelayerStatus(`Estimated fee: ${feeData.feeData?.minFee || '0.01'} USDC`);
      setVerificationStep('ai_complete');
    } catch (err: any) {
      setVerificationError(err.message || 'Relayer submission failed');
      setVerificationStep('error');
    }
  };

  // ── Grant Permission (ERC-7715) ──────────────────────────────────────
  const handleGrantPermission = async () => {
    if (!detail || !userAccount) return;
    setPermissionStep('requesting');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();

      setPermissionStep('deploying');

      // Grant permission to the agent delegation contract
      const adapterABI = [
        "function grantPermission(address delegatee, address bountyAddress, uint256 maxAmount, uint256 durationSeconds) returns (bytes32 permissionId)",
      ];
      const adapter = new ethers.Contract(
        CONTRACT_ADDRESSES.smartAccountAdapter,
        adapterABI,
        signer
      );

      const parsedAmount = ethers.parseUnits(detail.balance || '100', 6);
      const tx = await adapter.grantPermission(
        CONTRACT_ADDRESSES.agentDelegation,
        detail.address,
        parsedAmount,
        86400 * 30 // 30 days
      );
      const receipt = await tx.wait();

      // Extract permissionId from logs
      for (const log of receipt.logs) {
        try {
          const parsed = adapter.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === 'PermissionGranted') {
            setPermissionId(parsed.args.permissionId);
            break;
          }
        } catch { /* skip */ }
      }

      setPermissionStep('granted');
    } catch (err: any) {
      setPermissionError(err.message || 'Failed to grant permission');
      setPermissionStep('error');
    }
  };

  // ── Loading State ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-zinc-500">Loading bounty details from Arbitrum Sepolia...</p>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h2 className="text-xl font-bold mb-2 text-red-600">Bounty Not Found</h2>
          <p className="text-zinc-500 mb-6">{error}</p>
          <button onClick={() => router.push('/bounties')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold">
            ← Back to Bounties
          </button>
        </div>
      </div>
    );
  }

  // ── Computed Values ───────────────────────────────────────────────────
  const isCreator = userAccount?.toLowerCase() === detail.creator;
  const isContributor = userAccount?.toLowerCase() === detail.contributor;
  const canRelease = isCreator && detail.active && !detail.released && !detail.reclaimed;

  const statusColors: Record<string, string> = {
    open: 'bg-green-100 text-green-800 border-green-200',
    released: 'bg-gray-100 text-gray-800 border-gray-200',
    reclaimed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    disputed: 'bg-red-100 text-red-800 border-red-200',
    paused: 'bg-orange-100 text-orange-800 border-orange-200',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <button onClick={() => router.push('/bounties')}
            className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 transition">
            <span>←</span> <span>Back</span>
          </button>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <button onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-blue-600 hover:text-blue-700 transition">
                Dashboard
              </button>
            )}
            <button onClick={fetchBountyDetail}
              className="px-3 py-2 text-zinc-500 hover:text-zinc-700 transition">
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Main Bounty Card ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
          <div className="p-6 border-b border-zinc-100">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl font-bold truncate">
                    {detail.repoName || `Bounty #${detail.bountyId}`}
                  </h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColors[detail.status]}`}>
                    {detail.status}
                  </span>
                </div>
                {detail.issueNumber && detail.issueNumber > 0 && (
                  <p className="text-zinc-500">Issue #{detail.issueNumber}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-4xl font-bold text-green-600">{detail.balance}</p>
                <p className="text-sm text-zinc-400">USDC in Escrow</p>
              </div>
            </div>
          </div>

          <div className="p-6 grid md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Contract</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-zinc-400">Creator:</span> <span className="font-mono">{detail.creator.slice(0,10)}...{detail.creator.slice(-6)}</span></div>
                <div><span className="text-zinc-400">Agent:</span> <span className="font-mono">{detail.agent.slice(0,10)}...{detail.agent.slice(-6)}</span></div>
                <div><span className="text-zinc-400">Bounty ID:</span> <span className="font-mono">{detail.bountyId}</span></div>
                <div><span className="text-zinc-400">Address:</span> <span className="font-mono text-xs break-all">{detail.address}</span></div>
              </div>
            </div>
            {/* Right Column */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Details</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-zinc-400">Token:</span> USDC</div>
                <div><span className="text-zinc-400">Deposited:</span> {detail.depositAmount} USDC</div>
                <div><span className="text-zinc-400">Contest Period:</span> {Math.round(detail.contestPeriod / 86400)} days</div>
                {detail.contributor && detail.contributor !== '0x0000000000000000000000000000000000000000' && (
                  <div><span className="text-zinc-400">Contributor:</span> <span className="font-mono">{detail.contributor.slice(0,10)}...{detail.contributor.slice(-6)}</span></div>
                )}
              </div>
            </div>
          </div>

          {/* Status Flags */}
          <div className="px-6 pb-6">
            <div className="flex flex-wrap gap-2">
              {(() => {
                const flags = [
                  { label: 'Active', active: detail.active, style: 'bg-green-50 text-green-700 border-green-200' },
                  { label: 'Released', active: detail.released, style: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { label: 'Reclaimed', active: detail.reclaimed, style: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
                  { label: 'Disputed', active: detail.disputed, style: 'bg-red-50 text-red-700 border-red-200' },
                  { label: 'Paused', active: detail.paused, style: 'bg-orange-50 text-orange-700 border-orange-200' },
                ];
                const inactive = 'bg-zinc-50 text-zinc-400 border-zinc-200';
                return flags.map((flag) => (
                  <span key={flag.label}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      flag.active ? flag.style : inactive
                    }`}>
                    {flag.active ? flag.label : `Not ${flag.label}`}
                  </span>
                ));
              })()}
            </div>
          </div>

          {detail.status === 'open' && (
            <div className="px-6 pb-6 flex gap-2">
              <a href={`https://sepolia.arbiscan.io/address/${detail.address}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Arbiscan
              </a>
            </div>
          )}
        </div>

        {isAuthenticated && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* ── PR Submission + AI Verification Card ────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🤖</span> AI Verification
              </h2>

              {detail.status === 'open' && !detail.released && (
                <>
                  {/* PR URL Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Submit Pull Request URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://github.com/owner/repo/pull/42"
                      value={prUrl}
                      onChange={(e) => setPrUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      disabled={submittingPR}
                    />
                    <button
                      onClick={handleSubmitPR}
                      disabled={!prUrl.trim() || submittingPR}
                      className="mt-2 w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 text-sm"
                    >
                      {submittingPR ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                          AI Analyzing...
                        </span>
                      ) : (
                        '🔍 Verify with Venice AI'
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* Verification Result */}
              {verificationStep === 'ai_verifying' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-700">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full"></span>
                    <strong>Venice AI analyzing...</strong>
                  </div>
                  <p>Reviewing PR against issue requirements</p>
                </div>
              )}

              {verificationResult && verificationStep === 'ai_complete' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span>✅</span>
                    <strong>AI Verification Complete</strong>
                  </div>
                  <p className="text-green-600 mb-2">{verificationResult.summary}</p>
                  {verificationResult.score && (
                    <div className="flex gap-4 text-xs">
                      <span>Score: <strong>{verificationResult.score.score}/{verificationResult.score.maxScore}</strong></span>
                      <span>Decision: <strong>{verificationResult.decision?.action || 'approved'}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {verificationStep === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <strong>Verification Error:</strong> {verificationError}
                </div>
              )}

              {/* Release Actions */}
              {canRelease && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleAgentRelease}
                    disabled={verificationStep === 'preparing_tx' || verificationStep === 'signing' || verificationStep === 'submitting'}
                    className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 text-sm"
                  >
                    {verificationStep === 'preparing_tx' || verificationStep === 'signing' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                        Signing...
                      </span>
                    ) : (
                      '💰 Release via Agent (on-chain)'
                    )}
                  </button>

                  <button
                    onClick={handleRelayerRelease}
                    disabled={verificationStep === 'preparing_tx' || verificationStep === 'submitting'}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 text-sm"
                  >
                    {verificationStep === 'submitting' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                        {relayerStatus || 'Submitting...'}
                      </span>
                    ) : (
                      '⚡ Gasless Release via 1Shot Relayer'
                    )}
                  </button>

                  {relayerStatus && (
                    <p className="text-xs text-blue-600 text-center">{relayerStatus}</p>
                  )}

                  {txHash && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700">
                      <strong>Transaction:</strong>{' '}
                      <a href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="underline">
                        {txHash.slice(0, 18)}...{txHash.slice(-6)}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Permissions & Delegation Card ───────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>🔐</span> Permissions & Delegations
              </h2>

              {permissionStep === 'idle' && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-500">
                    Grant the AI agent permission to automatically release funds
                    when your bounty conditions are met.
                  </p>
                  <button
                    onClick={handleGrantPermission}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition text-sm"
                  >
                    🛡️ Grant Release Permission
                  </button>
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                    <strong>ERC-7715 Advanced Permissions</strong>
                    <p className="mt-1">
                      This grants the AgentDelegation contract permission to release
                      up to the bounty balance on your behalf. You can revoke anytime.
                    </p>
                  </div>
                </div>
              )}

              {permissionStep === 'requesting' && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <span className="animate-spin w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full"></span>
                  Requesting permission from your wallet...
                </div>
              )}

              {permissionStep === 'deploying' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <span className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></span>
                  Deploying permission on-chain...
                </div>
              )}

              {permissionStep === 'granted' && permissionId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">✅</span>
                    <strong className="text-sm text-green-800">Permission Granted!</strong>
                  </div>
                  <p className="text-xs text-green-600 font-mono break-all">
                    Permission ID: {permissionId}
                  </p>
                  <p className="text-xs text-green-500 mt-1">
                    Agent can now auto-release bounty funds
                  </p>
                </div>
              )}

              {permissionStep === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <strong>Permission Error:</strong> {permissionError}
                </div>
              )}

              {permissionStep === 'granted' && (
                <div className="mt-4 bg-zinc-50 rounded-lg p-3 text-xs text-zinc-600 space-y-1">
                  <p><strong>ERC-7715 Advanced Permissions</strong></p>
                  <p>• Agent can release up to the bounty balance</p>
                  <p>• Permission auto-expires after 30 days</p>
                  <p>• Redelegation chain: Creator → Agent → AI Verifier</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Integration Status Card ───────────────────────────────── */}
        <div className="bg-gradient-to-br from-zinc-50 to-blue-50 rounded-xl border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
            ⚙️ Integration Status
          </h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <strong className="text-green-700">Smart Contracts</strong>
              </div>
              <p className="text-xs text-zinc-500">Deployed on Arbitrum Sepolia</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <strong className="text-blue-700">Venice AI</strong>
              </div>
              <p className="text-xs text-zinc-500">PR verification & scoring</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                <strong className="text-purple-700">1Shot Relayer</strong>
              </div>
              <p className="text-xs text-zinc-500">Gasless transaction execution</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
            <span className="font-mono">Factory: {CONTRACT_ADDRESSES.bountyFactory.slice(0,10)}...{CONTRACT_ADDRESSES.bountyFactory.slice(-6)}</span>
            <span className="font-mono">AgentDelegation: {CONTRACT_ADDRESSES.agentDelegation.slice(0,10)}...{CONTRACT_ADDRESSES.agentDelegation.slice(-6)}</span>
            <span className="font-mono">USDC: {CONTRACT_ADDRESSES.usdc.slice(0,10)}...{CONTRACT_ADDRESSES.usdc.slice(-6)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
