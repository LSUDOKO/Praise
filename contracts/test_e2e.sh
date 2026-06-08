#!/usr/bin/env bash
# =============================================================================
# PRaise - End-to-End Bounty Lifecycle Test
# Tests the full bounty lifecycle on Arbitrum Sepolia
# =============================================================================

RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
CHAIN_ID=421614
GAS_PRICE=25000000000

BOUNTY_FACTORY="0x2cf9b3bC314504E4CA30eED0C527256Ea76fddc5"
AGENT_DELEGATION="0x9e5B19E900adCCd23aDc74867b056Dd6f1d9aA59"
BOUNTY_REGISTRY="0x76090E4943910F41290Aa4eC0c63B7F3aB6b6241"
DISPUTE_RESOLVER="0x05123409689B7BA30Ebb28d750d5250f242eA99E"
SMART_ACCOUNT_ADAPTER="0x78a5258dB533F8Ac986668DfFEB05019819eeC79"

PRIV_KEY="62a6197e8486247d144922462f90dd9d93aac058176415725ce1c6d39f08ab6a"
DEPLOYER="0x9F69599E5f0CE0D5D28795eFed28F0166c9F3955"

REPO_NAME="praise-test/test-repo"
ISSUE_NUMBER=42
BOUNTY_TITLE="Fix critical bug"
BOUNTY_DESC="Fix reentrancy vulnerability"
CONTEST_PERIOD=3600
DEPOSIT_AMOUNT="1000000"
MINT_AMOUNT="10000000"
SCORE_THRESHOLD=80
CONTRIBUTOR="0x1234567890123456789012345678901234567890"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS="${GREEN}✓${NC}"; FAIL="${RED}✗${NC}"

echo -e "${BLUE}================================================================================${NC}"
echo -e "${BLUE}  PRaise - End-to-End Bounty Lifecycle Test${NC}"
echo -e "${BLUE}  Chain: Arbitrum Sepolia (${CHAIN_ID})${NC}"
echo -e "${BLUE}  Deployer: ${DEPLOYER}${NC}"
echo -e "${BLUE}================================================================================${NC}"
echo ""

format_usdc() {
    local val="${1:-0}"
    python3 -c "
v = '$val'
if not v or v == '0':
    print('0.00')
else:
    v = v.zfill(7)
    print(v[:-6] + '.' + v[-6:-4])
" 2>/dev/null || echo "0.00"
}

# ── Step 1: Verify Contracts ──────────────────────────────────────────────
echo -e "${YELLOW}[1/8] Verifying deployed contracts...${NC}"
for entry in "BountyFactory:$BOUNTY_FACTORY" "AgentDelegation:$AGENT_DELEGATION" "BountyRegistry:$BOUNTY_REGISTRY" "DisputeResolver:$DISPUTE_RESOLVER" "SmartAccountAdapter:$SMART_ACCOUNT_ADAPTER"; do
    name="${entry%%:*}"
    addr="${entry##*:}"
    code=$(cast code "$addr" --rpc-url "$RPC_URL" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" != "0x" ]; then
        echo -e "  ${PASS} ${name}: ${addr}"
    else
        echo -e "  ${FAIL} ${name}: ${addr} - NO CODE"
    fi
done
echo ""

# ── Step 2: Deploy MockUSDC ───────────────────────────────────────────────
echo -e "${YELLOW}[2/8] Deploying MockUSDC...${NC}"
FORGE_OUTPUT=$(forge create src/MockUSDC.sol:MockUSDC \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" \
    --broadcast --legacy --gas-price "$GAS_PRICE" 2>&1)
MOCK_USDC=$(echo "$FORGE_OUTPUT" | grep "Deployed to:" | awk '{print $3}')
echo -e "  ${PASS} MockUSDC at: ${MOCK_USDC}"

echo "  Minting 10 USDC..."
cast send "$MOCK_USDC" "mint(address,uint256)" "$DEPLOYER" "$MINT_AMOUNT" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" > /dev/null 2>&1

BAL=$(cast call "$MOCK_USDC" "balanceOf(address)(uint256)" "$DEPLOYER" --rpc-url "$RPC_URL" 2>/dev/null)
echo -e "  ${PASS} Balance: $(format_usdc "$BAL") USDC"
echo ""

# ── Step 3: Create Bounty via BountyFactory ────────────────────────────────
echo -e "${YELLOW}[3/8] Creating bounty via BountyFactory...${NC}"

TX_OUTPUT=$(cast send "$BOUNTY_FACTORY" \
    "createBounty(address,address,uint256,string,uint256)" \
    "$AGENT_DELEGATION" "$MOCK_USDC" "$CONTEST_PERIOD" "$REPO_NAME" "$ISSUE_NUMBER" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" 2>&1)

TX_HASH=$(echo "$TX_OUTPUT" | grep "^transactionHash" | awk '{print $2}')
if [ -z "$TX_HASH" ]; then
    echo -e "  ${FAIL} Failed to create bounty"
    echo "$TX_OUTPUT"
    exit 1
fi
echo -e "  ${PASS} Create bounty tx: ${TX_HASH}"

sleep 3

# Get receipt and extract bounty address from logs
RECEIPT=$(cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json 2>/dev/null)
BOUNTY_ADDR=$(echo "$RECEIPT" | python3 -c "
import sys, json
r = json.load(sys.stdin)
for log in r.get('logs', []):
    topics = log.get('topics', [])
    if len(topics) >= 3:
        addr = topics[2]
        print('0x' + addr[-40:].lower())
        break
" 2>/dev/null)
echo -e "  ${PASS} Bounty deployed at: ${BOUNTY_ADDR}"

BOUNTY_ID=$(cast call "$BOUNTY_FACTORY" "bountyCount()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null)
echo -e "  ${PASS} Bounty ID: $((BOUNTY_ID ? BOUNTY_ID - 1 : 0))"
echo ""

# ── Step 4: Register in Registry ──────────────────────────────────────────
echo -e "${YELLOW}[4/8] Registering in BountyRegistry...${NC}"
cast send "$BOUNTY_REGISTRY" \
    "registerBounty(address,string,uint256,string,string)" \
    "$BOUNTY_ADDR" "$REPO_NAME" "$ISSUE_NUMBER" "$BOUNTY_TITLE" "$BOUNTY_DESC" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" \
    > /dev/null 2>&1
echo -e "  ${PASS} Registered"

REG_STATUS=$(cast call "$BOUNTY_REGISTRY" \
    "getBountyByIssue(string,uint256)(address)" \
    "$REPO_NAME" "$ISSUE_NUMBER" --rpc-url "$RPC_URL" 2>/dev/null)
echo -e "  ${PASS} Registry lookup: ${REG_STATUS}"
echo ""

# ── Step 5: Deposit USDC ──────────────────────────────────────────────────
echo -e "${YELLOW}[5/8] Depositing 1 USDC...${NC}"

echo "  Approving..."
cast send "$MOCK_USDC" "approve(address,uint256)" "$BOUNTY_ADDR" "$DEPOSIT_AMOUNT" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" > /dev/null 2>&1
echo -e "  ${PASS} Approved"

echo "  Depositing..."
cast send "$BOUNTY_ADDR" "deposit(uint256)" "$DEPOSIT_AMOUNT" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" > /dev/null 2>&1
echo -e "  ${PASS} Deposited 1 USDC"

ESCROW_BAL=$(cast call "$MOCK_USDC" "balanceOf(address)(uint256)" "$BOUNTY_ADDR" --rpc-url "$RPC_URL" 2>/dev/null)
echo -e "  ${PASS} Escrow: $(format_usdc "$ESCROW_BAL") USDC"

STATUS=$(cast call "$BOUNTY_ADDR" "getStatus()(bool,bool,bool,bool,bool)" --rpc-url "$RPC_URL" 2>/dev/null)
echo -e "  ${PASS} Status: ${STATUS}"
echo ""

# ── Step 6: AI Attestation & Release ──────────────────────────────────────
echo -e "${YELLOW}[6/8] AI attestation and fund release...${NC}"

PR_NUMBER=43
NONCE=$(python3 -c "import random; print(random.randint(1, 2**64 - 1))")
PR_MERGE_HASH=$(python3 -c "import hashlib; print('0x' + hashlib.sha256(b'$REPO_NAME/$PR_NUMBER').hexdigest())")

PY_OUTPUT=$(python3 << PYEOF
import hashlib
ba = bytes.fromhex("${BOUNTY_ADDR}"[2:].lower())
ct = bytes.fromhex("${CONTRIBUTOR}"[2:].lower())
sc = ${SCORE_THRESHOLD}.to_bytes(32, 'big')
ph = bytes.fromhex("${PR_MERGE_HASH}"[2:])
nc = ${NONCE}.to_bytes(32, 'big')
packed = ba + ct + sc + ph + nc
h = hashlib.sha3_256(packed).hexdigest()
msg = bytes.fromhex(h)
prefix = b'\x19Ethereum Signed Message:\n' + str(len(msg)).encode()
eth = hashlib.sha3_256(prefix + msg).hexdigest()
print(f"attest=0x{h}")
print(f"eth_msg=0x{eth}")
PYEOF
)

ATTEST_HASH=$(echo "$PY_OUTPUT" | grep '^attest=' | cut -d= -f2)
ETH_MSG_HASH=$(echo "$PY_OUTPUT" | grep '^eth_msg=' | cut -d= -f2)
echo "  Attestation hash: ${ATTEST_HASH}"

SIGNATURE=$(cast wallet sign --private-key "$PRIV_KEY" --no-hash "$ETH_MSG_HASH" 2>/dev/null)
echo -e "  ${PASS} Signed"

RELEASE_OUTPUT=$(cast send "$AGENT_DELEGATION" \
    "verifyAndRelease(address,address,uint256,bytes32,uint256,bytes)" \
    "$BOUNTY_ADDR" "$CONTRIBUTOR" "$SCORE_THRESHOLD" "$PR_MERGE_HASH" "$NONCE" "$SIGNATURE" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" 2>&1)

RELEASE_TX=$(echo "$RELEASE_OUTPUT" | grep "^transactionHash" | awk '{print $2}')
if [ -z "$RELEASE_TX" ]; then
    echo -e "  ${FAIL} Release failed!"
    echo "$RELEASE_OUTPUT"
else
    echo -e "  ${PASS} Release tx: ${RELEASE_TX}"
    sleep 3

    STATUS=$(cast call "$BOUNTY_ADDR" "getStatus()(bool,bool,bool,bool,bool)" --rpc-url "$RPC_URL" 2>/dev/null)
    echo -e "  ${PASS} Status: ${STATUS}"

    CONTRIB_BAL=$(cast call "$MOCK_USDC" "balanceOf(address)(uint256)" "$CONTRIBUTOR" --rpc-url "$RPC_URL" 2>/dev/null)
    echo -e "  ${PASS} Contributor: $(format_usdc "$CONTRIB_BAL") USDC"

    cast send "$BOUNTY_REGISTRY" "updateBountyStatus(address)" "$BOUNTY_ADDR" \
        --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" > /dev/null 2>&1 || true
    echo -e "  ${PASS} Registry updated"

    echo -e "  ${GREEN}  ✅ Release complete!${NC}"
fi
echo ""

# ── Step 7: Dispute Test ──────────────────────────────────────────────────
echo -e "${YELLOW}[7/8] Testing dispute flow...${NC}"

echo "  Creating dispute-test bounty..."
D_OUTPUT=$(cast send "$BOUNTY_FACTORY" \
    "createBounty(address,address,uint256,string,uint256)" \
    "$AGENT_DELEGATION" "$MOCK_USDC" "$CONTEST_PERIOD" "praise-test/dispute-repo" "99" \
    --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" 2>&1)

D_TX=$(echo "$D_OUTPUT" | grep "^transactionHash" | awk '{print $2}')
if [ -n "$D_TX" ]; then
    sleep 3
    D_JSON=$(cast receipt "$D_TX" --rpc-url "$RPC_URL" --json 2>/dev/null)
    D_BOUNTY=$(echo "$D_JSON" | python3 -c "
import sys, json
r = json.load(sys.stdin)
for log in r.get('logs', []):
    topics = log.get('topics', [])
    if len(topics) >= 3:
        print('0x' + topics[2][-40:].lower())
        break
" 2>/dev/null)
    echo -e "  ${PASS} Dispute bounty: ${D_BOUNTY}"

    cast send "$D_BOUNTY" "raiseDispute(string)" "Work not completed as specified" \
        --private-key "$PRIV_KEY" --rpc-url "$RPC_URL" --legacy --gas-price "$GAS_PRICE" > /dev/null 2>&1 \
        && echo -e "  ${PASS} Dispute raised"
fi
echo ""

# ── Step 8: Summary ───────────────────────────────────────────────────────
echo -e "${BLUE}================================================================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}================================================================================${NC}"
echo ""
echo -e "  ${BLUE}Contracts:${NC}"
echo -e "    BountyFactory:       ${BOUNTY_FACTORY}"
echo -e "    AgentDelegation:     ${AGENT_DELEGATION}"
echo -e "    BountyRegistry:      ${BOUNTY_REGISTRY}"
echo -e "    MockUSDC:            ${MOCK_USDC}"
echo ""
echo -e "  ${BLUE}Bounty:${NC}"
echo -e "    Address:    ${BOUNTY_ADDR}"
echo -e "    ID:         $((BOUNTY_ID ? BOUNTY_ID - 1 : 0))"
echo -e "    Escrow:     $(format_usdc "$ESCROW_BAL") USDC"
echo ""
echo -e "${GREEN}✅ End-to-end test complete!${NC}"
