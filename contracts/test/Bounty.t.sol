// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/Bounty.sol";
import "../src/BountyFactory.sol";
import "../src/AgentDelegation.sol";

contract BountyTest is Test {
    MockUSDC usdc;
    BountyFactory factory;
    AgentDelegation agentDelegation;

    address creator = makeAddr("creator");
    address contributor = makeAddr("contributor");
    address trustedSigner;
    uint256 trustedSignerPk;

    uint256 constant DEPOSIT_AMOUNT = 100e6; // 100 USDC
    uint256 constant CONTEST_PERIOD = 7 days;
    uint256 constant SCORE_THRESHOLD = 80;

    function setUp() public {
        // Generate a signer key pair
        (trustedSigner, trustedSignerPk) = makeAddrAndKey("trustedSigner");

        // Deploy contracts
        usdc = new MockUSDC();
        agentDelegation = new AgentDelegation(trustedSigner, SCORE_THRESHOLD);
        factory = new BountyFactory();

        // Mint USDC to creator
        usdc.mint(creator, 1000e6);
    }

    // ── Helper ───────────────────────────────────────────────────────────

    function _createAndFundBounty() internal returns (Bounty) {
        vm.startPrank(creator);
        (, address bountyAddr) = factory.createBounty(
            address(agentDelegation),
            address(usdc),
            CONTEST_PERIOD,
            "LSUDOKO/praise",
            42
        );
        Bounty bounty = Bounty(bountyAddr);
        usdc.approve(bountyAddr, DEPOSIT_AMOUNT);
        bounty.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();
        return bounty;
    }

    function _signAttestation(
        address bountyAddr,
        address _contributor,
        uint256 score,
        bytes32 prMergeHash,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 attestationHash = keccak256(
            abi.encodePacked(bountyAddr, _contributor, score, prMergeHash, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(trustedSignerPk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // ── Factory Tests ────────────────────────────────────────────────────

    function test_createBounty() public {
        vm.prank(creator);
        (uint256 id, address addr) = factory.createBounty(
            address(agentDelegation),
            address(usdc),
            CONTEST_PERIOD,
            "LSUDOKO/praise",
            42
        );
        assertEq(id, 0);
        assertTrue(addr != address(0));
        assertEq(factory.getBounty(0), addr);
    }

    // ── Deposit Tests ────────────────────────────────────────────────────

    function test_deposit() public {
        Bounty bounty = _createAndFundBounty();
        assertEq(bounty.depositAmount(), DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(bounty)), DEPOSIT_AMOUNT);
    }

    function test_deposit_onlyCreator() public {
        vm.prank(creator);
        (, address bountyAddr) = factory.createBounty(
            address(agentDelegation),
            address(usdc),
            CONTEST_PERIOD,
            "LSUDOKO/praise",
            42
        );
        Bounty bounty = Bounty(bountyAddr);

        usdc.mint(contributor, 100e6);
        vm.startPrank(contributor);
        usdc.approve(bountyAddr, 100e6);
        vm.expectRevert(Bounty.OnlyCreator.selector);
        bounty.deposit(100e6);
        vm.stopPrank();
    }

    // ── Release Tests ────────────────────────────────────────────────────

    function test_release_viaAgentDelegation() public {
        Bounty bounty = _createAndFundBounty();

        bytes32 prMergeHash = keccak256("repo/praise#42");
        uint256 nonce = 1;
        uint256 score = 90;

        bytes memory sig = _signAttestation(
            address(bounty), contributor, score, prMergeHash, nonce
        );

        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );

        assertTrue(bounty.released());
        assertEq(bounty.contributor(), contributor);
        assertEq(usdc.balanceOf(contributor), DEPOSIT_AMOUNT);
    }

    function test_release_scoreBelowThreshold_reverts() public {
        Bounty bounty = _createAndFundBounty();

        bytes32 prMergeHash = keccak256("repo/praise#42");
        uint256 nonce = 1;
        uint256 score = 50; // below threshold

        bytes memory sig = _signAttestation(
            address(bounty), contributor, score, prMergeHash, nonce
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentDelegation.ScoreBelowThreshold.selector, score, SCORE_THRESHOLD
            )
        );
        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );
    }

    function test_release_replayPrevented() public {
        Bounty bounty = _createAndFundBounty();

        bytes32 prMergeHash = keccak256("repo/praise#42");
        uint256 nonce = 1;
        uint256 score = 90;

        bytes memory sig = _signAttestation(
            address(bounty), contributor, score, prMergeHash, nonce
        );

        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );

        // Replay should revert
        vm.expectRevert(AgentDelegation.AttestationAlreadyUsed.selector);
        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );
    }

    // ── Pause Tests ──────────────────────────────────────────────────────

    function test_pause_blocksRelease() public {
        Bounty bounty = _createAndFundBounty();

        vm.prank(creator);
        bounty.setPaused(true);

        bytes32 prMergeHash = keccak256("repo/praise#42");
        uint256 nonce = 1;
        uint256 score = 90;

        bytes memory sig = _signAttestation(
            address(bounty), contributor, score, prMergeHash, nonce
        );

        vm.expectRevert(Bounty.IsPaused.selector);
        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );
    }

    function test_unpause_allowsRelease() public {
        Bounty bounty = _createAndFundBounty();

        vm.prank(creator);
        bounty.setPaused(true);

        vm.prank(creator);
        bounty.setPaused(false);

        bytes32 prMergeHash = keccak256("repo/praise#42");
        uint256 nonce = 1;
        uint256 score = 90;

        bytes memory sig = _signAttestation(
            address(bounty), contributor, score, prMergeHash, nonce
        );

        agentDelegation.verifyAndRelease(
            address(bounty), contributor, score, prMergeHash, nonce, sig
        );
        assertTrue(bounty.released());
    }

    // ── Reclaim Tests ────────────────────────────────────────────────────

    function test_reclaim_afterContestPeriod() public {
        Bounty bounty = _createAndFundBounty();

        // Warp past contest period
        vm.warp(block.timestamp + CONTEST_PERIOD + 1);

        vm.prank(creator);
        bounty.reclaim();

        assertTrue(bounty.reclaimed());
        assertEq(usdc.balanceOf(creator), 1000e6); // full balance restored
    }

    function test_reclaim_beforeContestPeriod_reverts() public {
        Bounty bounty = _createAndFundBounty();

        vm.prank(creator);
        vm.expectRevert(Bounty.ContestPeriodNotOver.selector);
        bounty.reclaim();
    }

    function test_reclaim_afterRelease_reverts() public {
        Bounty bounty = _createAndFundBounty();

        // Release first
        bytes32 prMergeHash = keccak256("repo/praise#42");
        bytes memory sig = _signAttestation(
            address(bounty), contributor, 90, prMergeHash, 1
        );
        agentDelegation.verifyAndRelease(
            address(bounty), contributor, 90, prMergeHash, 1, sig
        );

        vm.warp(block.timestamp + CONTEST_PERIOD + 1);

        vm.prank(creator);
        vm.expectRevert(Bounty.AlreadyReleased.selector);
        bounty.reclaim();
    }

    // ── Edge Cases ───────────────────────────────────────────────────────

    function test_release_directCall_reverts() public {
        Bounty bounty = _createAndFundBounty();

        // Direct release from non-agent should revert
        vm.prank(creator);
        vm.expectRevert(Bounty.OnlyAgent.selector);
        bounty.release(contributor);
    }

    function test_zeroAddress_contributor_reverts() public {
        Bounty bounty = _createAndFundBounty();

        bytes32 prMergeHash = keccak256("repo/praise#42");
        bytes memory sig = _signAttestation(
            address(bounty), address(0), 90, prMergeHash, 1
        );

        vm.expectRevert(AgentDelegation.ZeroAddress.selector);
        agentDelegation.verifyAndRelease(
            address(bounty), address(0), 90, prMergeHash, 1, sig
        );
    }
}
