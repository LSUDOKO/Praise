/**
 * Bounty.sol - Core escrow contract ABI
 * Deployed on Arbitrum Sepolia
 */
export const BOUNTY_ABI = [
  // State-changing functions
  "function deposit(uint256 amount)",
  "function release(address contributor)",
  "function reclaim()",
  "function setPaused(bool _paused)",
  "function raiseDispute(string reason)",
  "function resolveDispute(bool contributorWins)",
  "function emergencyWithdraw(address recipient)",

  // View functions
  "function creator() view returns (address)",
  "function agent() view returns (address)",
  "function token() view returns (address)",
  "function contestPeriod() view returns (uint256)",
  "function bountyId() view returns (uint256)",
  "function depositAmount() view returns (uint256)",
  "function releasedAmount() view returns (uint256)",
  "function contributor() view returns (address)",
  "function depositTimestamp() view returns (uint256)",
  "function released() view returns (bool)",
  "function reclaimed() view returns (bool)",
  "function paused() view returns (bool)",
  "function disputed() view returns (bool)",
  "function balance() view returns (uint256)",
  "function getStatus() view returns (bool active, bool rel, bool recl, bool disp, bool pau)",
  "function getDetails() view returns (address _creator, address _agent, address _token, uint256 _contestPeriod, uint256 _bountyId, uint256 _depositAmount, uint256 _releasedAmount, address _contributor)",
  "function isReleasable() view returns (bool)",
  "function timeUntilReclaim() view returns (uint256)",
] as const;

export const BOUNTY_FACTORY_ABI = [
  // State-changing
  "function createBounty(address agent, address token, uint256 contestPeriod, string repoName, uint256 issueNumber) returns (uint256 bountyId, address bountyAddress)",
  "function setPaused(bool _paused)",

  // Views
  "function bountyCount() view returns (uint256)",
  "function bounties(uint256) view returns (address)",
  "function bountyIds(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function getBounty(uint256 _bountyId) view returns (address)",
  "function getBountyByIssue(string repoName, uint256 issueNumber) view returns (uint256)",
  "function getBountyId(address bountyAddress) view returns (uint256)",
] as const;

export const AGENT_DELEGATION_ABI = [
  // State-changing
  "function verifyAndRelease(address bountyAddress, address contributor, uint256 score, bytes32 prMergeHash, uint256 nonce, bytes signature)",
  "function setAttestationTTL(uint256 newTTL)",
  "function revokeSigner(address signer)",
  "function setRateLimit(uint256 maxReleases, uint256 windowSeconds)",

  // Views
  "function trustedSigner() view returns (address)",
  "function scoreThreshold() view returns (uint256)",
  "function attestationTTL() view returns (uint256)",
  "function isAttestationUsed(bytes32 attestationHash) view returns (bool)",
  "function isSignerRevoked(address signer) view returns (bool)",
  "function getAttestationTime(bytes32 attestationHash) view returns (uint256)",
  "function isAttestationValid(bytes32 attestationHash) view returns (bool)",
] as const;

export const BOUNTY_REGISTRY_ABI = [
  // State-changing
  "function registerBounty(address bountyAddress, string repoName, uint256 issueNumber, string title, string description)",
  "function updateBountyStatus(address bountyAddress)",
  "function recordRelease(address bountyAddress, uint256 prNumber)",
  "function updateMetadata(address bountyAddress, string newTitle, string newDescription, string labelsJson)",

  // Views
  "function getBountyByIssue(string repoName, uint256 issueNumber) view returns (address)",
  "function getRepoBounties(string repoName) view returns (address[])",
  "function getBountiesByStatus(string status) view returns (address[])",
  "function getBountiesByCreator(address creator) view returns (address[])",
  "function getAllBounties(uint256 offset, uint256 limit) view returns (address[])",
  "function getTotalBounties() view returns (uint256)",
  "function getStatusCount(string status) view returns (uint256)",
  "function getRepoStats(string repoName) view returns (uint256 total, uint256 open, uint256 released, uint256 reclaimed)",
] as const;

export const DISPUTE_RESOLVER_ABI = [
  // State-changing
  "function createDispute(address bountyAddress, string reason, string evidenceHash)",
  "function resolveDispute(address bountyAddress, bool contributorWins)",
  "function appealDispute(address bountyAddress, string appealReason)",
  "function autoResolveDispute(address bountyAddress)",
  "function addArbitrator(address arbitrator)",
  "function removeArbitrator(address arbitrator)",
  "function updateConfig(uint256 resolutionWindow, uint256 appealWindow, uint256 autoResolution)",

  // Views
  "function getDispute(address bountyAddress) view returns (tuple(address bounty, address raiser, string reason, uint256 createdAt, uint256 resolvedAt, address arbitrator, bool contributorWins, bool isResolved, bool isAppealed, uint256 appealedAt, string evidence))",
  "function hasOpenDispute(address bountyAddress) view returns (bool)",
  "function isArbitrator(address account) view returns (bool)",
  "function getAllDisputes(uint256 offset, uint256 limit) view returns (address[])",
] as const;

export const SMART_ACCOUNT_ADAPTER_ABI = [
  // State-changing
  "function grantPermission(address delegatee, address bountyAddress, uint256 maxAmount, uint256 durationSeconds) returns (bytes32 permissionId)",
  "function revokePermission(bytes32 permissionId)",
  "function executePermission(bytes32 permissionId, address contributor, uint256 amount)",
  "function createSessionKey(address sessionKey, uint256 durationSeconds, uint256 maxReleasesPerDay) returns (bytes32 sessionId)",
  "function revokeSessionKey(bytes32 sessionId)",
  "function registerSmartAccount(address userAddress, address smartAccount)",
  "function setDefaultPermissionDuration(uint256 newDuration)",
  "function setOneShotRelayer(address newRelayer)",

  // Views
  "function getUserSmartAccount(address userAddress) view returns (address)",
  "function getSmartAccountOwner(address smartAccount) view returns (address)",
  "function isPermissionValid(bytes32 permissionId) view returns (bool)",
  "function getDelegatorPermissions(address delegator) view returns (bytes32[])",
  "function getBountyPermissions(address bountyAddress) view returns (bytes32[])",
  "function defaultPermissionDuration() view returns (uint256)",
] as const;

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

// Contract addresses on Arbitrum Sepolia (LIVE)
export const CONTRACT_ADDRESSES = {
  usdc: "0x75Cc4fDf07DA32FD5A00f8B922e7d51DDA4e50b9" as const,
  bountyFactory: "0x2cf9b3bC314504E4CA30eED0C527256Ea76fddc5" as const,
  agentDelegation: "0x9e5B19E900adCCd23aDc74867b056Dd6f1d9aA59" as const,
  bountyRegistry: "0x76090E4943910F41290Aa4eC0c63B7F3aB6b6241" as const,
  disputeResolver: "0x05123409689B7BA30Ebb28d750d5250f242eA99E" as const,
  smartAccountAdapter: "0x78a5258dB533F8Ac986668DfFEB05019819eeC79" as const,
  chainId: 421614,
  rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
} as const;
