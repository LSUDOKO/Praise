// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/Bounty.sol";
import "../src/BountyFactory.sol";
import "../src/BountyRegistry.sol";
import "../src/AgentDelegation.sol";
import "../src/DisputeResolver.sol";
import "../src/SmartAccountAdapter.sol";

/**
 * @title EndToEndTest
 * @notice Fork test that exercises the full bounty lifecycle on Arbitrum Sepolia.
 *
 * Run with:
 *   forge test --fork-url https://sepolia-rollup.arbitrum.io/rpc --match-test testFullBountyLifecycle -vvv
 *
 * The test uses the already-deployed contracts plus a freshly deployed MockUSDC.
 * The deployer private key (the trusted signer) signs the Venice AI attestation.
 */
contract EndToEndTest is Test {
    // ── Existing deployed addresses (Arbitrum Sepolia) ───────────────────
    address constant BountyFactoryAddr = 0x2cf9b3bC314504E4CA30eED0C527256Ea76fddc5;
    address constant BountyRegistryAddr = 0x76090E4943910F41290Aa4eC0c63B7F3aB6b6241;
    address constant AgentDelegationAddr = 0x9e5B19E900adCCd23aDc74867b056Dd6f1d9aA59;
    address constant DisputeResolverAddr = 0x05123409689B7BA30Ebb28d750d5250f242eA99E;
    address constant SmartAccountAdapterAddr = 0x78a5258dB533F8Ac986668DfFEB05019819eeC79;

    // Deployer = trusted signer (from .env PRIVATE_KEY)
    uint256 constant DeployerPK = 0x62a6197e8486247d144922462f90dd9d93aac058176415725ce1c6d39f08ab6a;
    address constant Deployer = 0x9F69599E5f0CE0D5D28795eFed28F0166c9F3955;
    address constant Contributor = address(0xB0B);

    // Test constants
    uint256 constant CONTEST_PERIOD = 7 days;
    uint256 constant BOUNTY_AMOUNT = 100_000_000; // 100 USDC (6 decimals)
    string constant REPO_NAME = "praise-oss/praise";
    uint256 constant ISSUE_NUMBER = 42;
    uint256 constant PR_NUMBER = 101;

    // ── Contract instances ──────────────────────────────────────────────

    BountyFactory factory;
    BountyRegistry registry;
    AgentDelegation agentDelegation;
    DisputeResolver disputeResolver;
    SmartAccountAdapter adapter;
    MockUSDC usdc;

    // ── Setup ───────────────────────────────────────────────────────────

    function setUp() public {
        // Fork Arbitrum Sepolia at the latest block
        vm.createSelectFork("https://sepolia-rollup.arbitrum.io/rpc");

        // Wire up deployed contracts
        factory = BountyFactory(BountyFactoryAddr);
        registry = BountyRegistry(BountyRegistryAddr);
        agentDelegation = AgentDelegation(AgentDelegationAddr);
        disputeResolver = DisputeResolver(DisputeResolverAddr);
        adapter = SmartAccountAdapter(SmartAccountAdapterAddr);

        // Deploy MockUSDC fresh in the fork so we have full control
        usdc = new MockUSDC();

        // Give deployer some USDC for testing
        vm.prank(Deployer);
        usdc.mint(Deployer, BOUNTY_AMOUNT * 10); // 10x the bounty amount
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function _createAndFundBounty(uint256 issueNumber) internal returns (uint256, address) {
        vm.prank(Deployer);
        (uint256 bountyId, address bountyAddress) = factory.createBounty(
            AgentDelegationAddr,
            address(usdc),
            CONTEST_PERIOD,
            REPO_NAME,
            issueNumber
        );

        Bounty bounty = Bounty(bountyAddress);
        vm.startPrank(Deployer);
        usdc.approve(bountyAddress, BOUNTY_AMOUNT);
        bounty.deposit(BOUNTY_AMOUNT);
        vm.stopPrank();

        return (bountyId, bountyAddress);
    }

    function _createAttestation(
        address bountyAddress,
        address contributor,
        uint256 score,
        bytes32 prMergeHash,
        uint256 nonce
    ) internal returns (bytes32, bytes memory) {
        bytes32 attestationHash = keccak256(
            abi.encodePacked(bountyAddress, contributor, score, prMergeHash, nonce)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DeployerPK, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        return (attestationHash, signature);
    }

    // ── Test: Full Bounty Lifecycle ────────────────────────────────────

    function testFullBountyLifecycle() public {
        // ═══════════════════════════════════════════════════════════════
        // PHASE 1: Create a bounty via BountyFactory
        // ═══════════════════════════════════════════════════════════════

        vm.startPrank(Deployer);

        // Create the bounty
        (uint256 bountyId, address bountyAddress) = factory.createBounty(
            AgentDelegationAddr,
            address(usdc),
            CONTEST_PERIOD,
            REPO_NAME,
            ISSUE_NUMBER
        );

        vm.stopPrank();

        assertTrue(bountyAddress != address(0), "Bounty address should not be zero");
        console.log("   Bounty ID:", bountyId);
        console.log(unicode"✅ PHASE 1: Bounty created");
        console.log("   Bounty ID:", bountyId);
        console.log("   Bounty Address:", bountyAddress);

        // ═══════════════════════════════════════════════════════════════
        // PHASE 2: Register bounty with BountyRegistry
        // ═══════════════════════════════════════════════════════════════

        vm.prank(Deployer);
        registry.registerBounty(
            bountyAddress,
            REPO_NAME,
            ISSUE_NUMBER,
            "Fix login button alignment",
            "The login button is misaligned on mobile viewports"
        );

        // Verify registry state
        address registeredBounty = registry.getBountyByIssue(REPO_NAME, ISSUE_NUMBER);
        assertEq(registeredBounty, bountyAddress, "Bounty should be registered");
        uint256 totalBounties = registry.getTotalBounties();
        assertEq(totalBounties, 1, "Registry should have 1 bounty");

        {
            BountyRegistry.BountyMetadata memory meta = registry.getBountyMetadata(bountyAddress);
            assertEq(meta.repoName, REPO_NAME, "Repo name should match");
            assertEq(meta.issueNumber, ISSUE_NUMBER, "Issue number should match");
            assertEq(meta.status, "open", "Status should be 'open'");
        }

        console.log(unicode"✅ PHASE 2: Bounty registered in registry");
        console.log("   Status: open");
        console.log("   Total bounties:", totalBounties);

        // ═══════════════════════════════════════════════════════════════
        // PHASE 3: Approve USDC and deposit into bounty
        // ═══════════════════════════════════════════════════════════════

        Bounty bounty = Bounty(bountyAddress);

        vm.startPrank(Deployer);

        // Approve the bounty contract to spend USDC
        usdc.approve(bountyAddress, BOUNTY_AMOUNT);
        assertEq(
            usdc.allowance(Deployer, bountyAddress),
            BOUNTY_AMOUNT,
            "Allowance should be set"
        );

        // Check deployer's USDC balance before deposit
        uint256 balanceBefore = usdc.balanceOf(Deployer);

        // Deposit USDC into the bounty
        bounty.deposit(BOUNTY_AMOUNT);

        vm.stopPrank();

        // Verify deposit state
        assertEq(bounty.depositAmount(), BOUNTY_AMOUNT, "Deposit amount should match");
        assertEq(bounty.depositTimestamp(), block.timestamp, "Deposit timestamp should be now");
        assertEq(usdc.balanceOf(bountyAddress), BOUNTY_AMOUNT, "Bounty should hold the USDC");
        assertEq(usdc.balanceOf(Deployer), balanceBefore - BOUNTY_AMOUNT, "Deployer balance should decrease");

        // Check bounty status
        (bool active, bool rel, bool recl, bool disp, bool pau) = bounty.getStatus();
        assertTrue(active, "Bounty should be active");
        assertFalse(rel, "Should not be released");
        assertFalse(recl, "Should not be reclaimed");
        assertFalse(disp, "Should not be disputed");
        assertFalse(pau, "Should not be paused");
        assertTrue(bounty.isReleasable(), "Bounty should be releasable");

        console.log(unicode"✅ PHASE 3: USDC deposited into bounty");
        console.log("   Deposit amount:", BOUNTY_AMOUNT);
        console.log("   Bounty balance:", usdc.balanceOf(bountyAddress));

        // ═══════════════════════════════════════════════════════════════
        // PHASE 4: Update registry status and register PR
        // ═══════════════════════════════════════════════════════════════

        vm.prank(Deployer);
        registry.recordRelease(bountyAddress, PR_NUMBER);

        console.log(unicode"✅ PHASE 4: PR recorded in registry");

        // ═══════════════════════════════════════════════════════════════
        // PHASE 5: Verify attestation and release via AgentDelegation
        // ═══════════════════════════════════════════════════════════════

        // Venice AI verification flow:
        //   1. Venice AI reviews PR and produces a score (simulated)
        //   2. Server wallet signs the attestation
        //   3. Agent calls verifyAndRelease()

        uint256 aiScore = 85; // Above the 80 threshold
        bytes32 prMergeHash = keccak256(abi.encodePacked(REPO_NAME, PR_NUMBER));
        uint256 nonce = 1;

        // Compute attestation hash as AgentDelegation does:
        // keccak256(abi.encodePacked(bountyAddress, contributor, score, prMergeHash, nonce))
        bytes32 attestationHash = keccak256(
            abi.encodePacked(bountyAddress, Contributor, aiScore, prMergeHash, nonce)
        );

        // Sign with trusted signer (deployer) private key
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DeployerPK, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Call verifyAndRelease — should succeed (anyone can call)
        agentDelegation.verifyAndRelease(
            bountyAddress,
            Contributor,
            aiScore,
            prMergeHash,
            nonce,
            signature
        );

        // ═══════════════════════════════════════════════════════════════
        // PHASE 6: Verify final on-chain state
        // ═══════════════════════════════════════════════════════════════

        // Attestation marked as used
        assertTrue(agentDelegation.isAttestationUsed(attestationHash), "Attestation should be used");

        // Bounty released
        assertTrue(bounty.released(), "Bounty should be released");
        assertEq(bounty.contributor(), Contributor, "Contributor should be set");
        assertEq(bounty.releasedAmount(), BOUNTY_AMOUNT, "Released amount should match deposit");

        // USDC transferred to contributor
        assertEq(usdc.balanceOf(Contributor), BOUNTY_AMOUNT, "Contributor should have received USDC");

        // Bounty escrow empty
        assertEq(usdc.balanceOf(bountyAddress), 0, "Bounty should have no more USDC");

        // Registry status
        {
            BountyRegistry.BountyMetadata memory metaBefore = registry.getBountyMetadata(bountyAddress);
            assertEq(
                keccak256(bytes(metaBefore.status)),
                keccak256(bytes("open")),
                "Status should be 'open' until updateBountyStatus is called"
            );
        }

        // Update registry status
        vm.prank(Deployer);
        registry.updateBountyStatus(bountyAddress);

        BountyRegistry.BountyMetadata memory metaUpdated = registry.getBountyMetadata(bountyAddress);
        assertEq(
            keccak256(bytes(metaUpdated.status)),
            keccak256(bytes("released")),
            "Status should be 'released' after registry update"
        );

        console.log("");
        console.log(unicode"═══════════════════════════════════════════════");
        console.log(unicode"✅ FULL BOUNTY LIFECYCLE COMPLETED SUCCESSFULLY");
        console.log(unicode"═══════════════════════════════════════════════");
        console.log("   Bounty ID:", bountyId);
        console.log("   Bounty Address:", bountyAddress);
        console.log("   Creator:", Deployer);
        console.log("   Agent (AgentDelegation):", AgentDelegationAddr);
        console.log("   Contributor:", Contributor);
        console.log("   Amount:", BOUNTY_AMOUNT);
        console.log("   AI Score:", aiScore);
        console.log("   Attestation Used:", agentDelegation.isAttestationUsed(attestationHash));
        console.log("   Bounty Released:", bounty.released());
        console.log("   Contributor Balance:", usdc.balanceOf(Contributor));
        console.log(unicode"═══════════════════════════════════════════════");
    }

    // ── Test: Reclaim after contest period ──────────────────────────────

    function testReclaimAfterContestPeriod() public {
        (, address bountyAddress) = _createAndFundBounty(99);
        Bounty bounty = Bounty(bountyAddress);

        // Warp past contest period
        vm.warp(block.timestamp + 7 days + 1);

        // Reclaim
        vm.prank(Deployer);
        bounty.reclaim();

        assertTrue(bounty.reclaimed(), "Bounty should be reclaimed");
        assertEq(usdc.balanceOf(Deployer), BOUNTY_AMOUNT * 10, "Deployer should have all funds back after reclaim");
        assertEq(usdc.balanceOf(bountyAddress), 0, "Bounty should be empty");

        console.log(unicode"✅ Reclaim after contest period test passed");
    }

    // ── Test: Reclaim fails before contest period ends ──────────────────

    function testCannotReclaimBeforeContestEnd() public {
        (, address bountyAddress) = _createAndFundBounty(98);
        Bounty bounty = Bounty(bountyAddress);

        // Try to reclaim before contest period ends
        vm.prank(Deployer);
        vm.expectRevert(Bounty.ContestPeriodNotOver.selector);
        bounty.reclaim();

        console.log(unicode"✅ Cannot reclaim before contest period ends");
    }

    // ── Test: Score below threshold is rejected ─────────────────────────

    function testScoreBelowThresholdReverts() public {
        (, address bountyAddress) = _createAndFundBounty(100);

        bytes32 prMergeHash = keccak256(abi.encodePacked(REPO_NAME, uint256(100)));
        uint256 lowScore = 50; // Below 80 threshold

        (bytes32 attestationHash, bytes memory sig) = _createAttestation(
            bountyAddress, Contributor, lowScore, prMergeHash, 1
        );

        vm.expectRevert(
            abi.encodeWithSelector(AgentDelegation.ScoreBelowThreshold.selector, lowScore, 80)
        );
        agentDelegation.verifyAndRelease(
            bountyAddress, Contributor, lowScore, prMergeHash, 1, sig
        );

        console.log(unicode"✅ Low score rejection test passed");
    }

    // ── Test: Cannot release an already-released bounty ─────────────────

    function testCannotReleaseAlreadyReleasedBounty() public {
        (, address bountyAddress) = _createAndFundBounty(101);
        Bounty bounty = Bounty(bountyAddress);

        // First release succeeds
        bytes32 prMergeHash = keccak256(abi.encodePacked(REPO_NAME, uint256(101)));
        uint256 score = 90;

        (bytes32 attestationHash, bytes memory sig) = _createAttestation(
            bountyAddress, Contributor, score, prMergeHash, 1
        );

        agentDelegation.verifyAndRelease(bountyAddress, Contributor, score, prMergeHash, 1, sig);
        assertTrue(bounty.released(), "First release should succeed");

        // Second release with a new attestation should fail (bounty already released)
        (bytes32 attestationHash2, bytes memory sig2) = _createAttestation(
            bountyAddress, Contributor, score, prMergeHash, 2
        );

        vm.expectRevert(Bounty.AlreadyReleased.selector);
        agentDelegation.verifyAndRelease(bountyAddress, Contributor, score, prMergeHash, 2, sig2);

        console.log(unicode"✅ Cannot release already-released bounty test passed");
    }

    // ── Test: Invalid signature is rejected ─────────────────────────────

    function testInvalidSignatureReverts() public {
        (, address bountyAddress) = _createAndFundBounty(200);

        bytes32 prMergeHash = keccak256(abi.encodePacked(REPO_NAME, uint256(200)));
        uint256 score = 85;

        // Use a WRONG private key to sign (not the trusted signer)
        bytes32 attestationHash = keccak256(
            abi.encodePacked(bountyAddress, Contributor, score, prMergeHash, uint256(1))
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xDEADBEEF, ethSignedHash); // wrong key
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(AgentDelegation.InvalidSignature.selector);
        agentDelegation.verifyAndRelease(
            bountyAddress, Contributor, score, prMergeHash, 1, sig
        );

        console.log(unicode"✅ Invalid signature rejection test passed");
    }

    // ── Test: Not bounty agent reverts ──────────────────────────────────

    function testNotBountyAgentReverts() public {
        // Create a bounty with a DIFFERENT agent address (not AgentDelegation)
        vm.prank(Deployer);
        (uint256 bountyId, address bountyAddress) = factory.createBounty(
            address(0xC0FFEE), // invalid agent
            address(usdc),
            CONTEST_PERIOD,
            REPO_NAME,
            300
        );

        // Try to release via AgentDelegation
        bytes32 prMergeHash = keccak256(abi.encodePacked(REPO_NAME, uint256(300)));
        uint256 score = 85;

        (bytes32 attestationHash, bytes memory sig) = _createAttestation(
            bountyAddress, Contributor, score, prMergeHash, 1
        );

        vm.expectRevert(AgentDelegation.NotBountyAgent.selector);
        agentDelegation.verifyAndRelease(
            bountyAddress, Contributor, score, prMergeHash, 1, sig
        );

        console.log(unicode"✅ Not bounty agent rejection test passed");
    }

    // ── Test: Permission grant and revoke on SmartAccountAdapter ─────────

    function testPermissionGrantAndRevoke() public {
        (, address bountyAddress) = _createAndFundBounty(400);

        vm.startPrank(Deployer);

        // Grant permission to AgentDelegation
        bytes32 permissionId = adapter.grantPermission(
            AgentDelegationAddr,
            bountyAddress,
            BOUNTY_AMOUNT,
            90 days
        );

        assertTrue(adapter.isPermissionValid(permissionId), "Permission should be valid");

        // Check permission details
        SmartAccountAdapter.Permission memory perm = adapter.getPermission(permissionId);

        assertEq(perm.delegator, Deployer, "Delegator should be deployer");
        assertEq(perm.delegatee, AgentDelegationAddr, "Delegatee should be AgentDelegation");
        assertEq(perm.bountyAddress, bountyAddress, "Bounty address should match");
        assertEq(perm.maxAmount, BOUNTY_AMOUNT, "Max amount should match");
        assertTrue(perm.active, "Permission should be active");

        // Revoke the permission
        adapter.revokePermission(permissionId);

        assertFalse(adapter.isPermissionValid(permissionId), "Permission should be invalid after revoke");

        vm.stopPrank();

        console.log(unicode"✅ Permission grant and revoke test passed");
    }

    // ── Test: Dispute lifecycle ─────────────────────────────────────────

    function testDisputeLifecycle() public {
        (, address bountyAddress) = _createAndFundBounty(500);
        Bounty bounty = Bounty(bountyAddress);

        // Raise a dispute directly on the Bounty as creator.
        // Note: Bounty.raiseDispute() has onlyCreatorOrAgent modifier, so
        // only the creator or agent (AgentDelegation) can raise a dispute.
        vm.prank(Deployer);
        bounty.raiseDispute("The submission does not meet requirements");

        assertTrue(bounty.disputed(), "Bounty should be disputed after dispute raised");
        assertFalse(bounty.isReleasable(), "Should not be releasable while disputed");

        // Resolve the dispute by calling Bounty.resolveDispute() as owner (creator).
        // resolveDispute(true) requires contributor to be non-zero (only set via release),
        // so we resolve with contributorWins = false (creator gets funds back).
        // This is a valid dispute outcome and tests the full dispute lifecycle.
        vm.prank(Deployer);
        bounty.resolveDispute(false); // Creator wins → funds returned

        assertTrue(bounty.reclaimed(), "Bounty should be reclaimed after dispute resolution");
        assertFalse(bounty.disputed(), "Bounty should no longer be disputed");
        assertEq(usdc.balanceOf(Deployer), BOUNTY_AMOUNT * 10, "Creator should get funds back on dispute win");

        console.log(unicode"✅ Dispute lifecycle test passed");
    }
}
