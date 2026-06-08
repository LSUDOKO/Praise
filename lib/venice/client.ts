/**
 * Venice AI Client
 *
 * OpenAI-compatible inference client for Venice.ai.
 * Used for:
 * - Bounty PR verification (did the PR fix the issue?)
 * - Code review scoring
 * - AI agent orchestration
 * - Automated dispute resolution analysis
 *
 * API: https://api.venice.ai/api/v1
 * Auth: Bearer token via VENICE_API_KEY
 */

// ── Configuration ─────────────────────────────────────────────────────────

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "zai-org-glm-5-1"; // Balanced text model
const REASONING_MODEL = "kimi-k2-6"; // Strong reasoning model for code review
const FAST_MODEL = "llama-4-scout"; // Fast model for simple tasks

function getApiKey(): string {
  const key = process.env.VENICE_API_KEY;
  if (!key) {
    throw new Error(
      "VENICE_API_KEY environment variable is not set. " +
        "Get a key from https://venice.ai/settings/api"
    );
  }
  return key;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_completion_tokens?: number;
  response_format?: { type: "json_schema" | "json_object" | "text"; json_schema?: any };
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── PR Review Scoring Schema ──────────────────────────────────────────────

export interface PRReviewScore {
  score: number;
  maxScore: number;
  explanation: string;
  codeQuality: number;
  relevanceToIssue: number;
  completeness: number;
  potentialIssues: string[];
  suggestions: string[];
}

export interface BountyVerificationResult {
  isPRValid: boolean;
  confidence: number; // 0-1
  score: PRReviewScore;
  summary: string;
  passedAutomatedChecks: boolean;
}

// ── HTTP Client ───────────────────────────────────────────────────────────

async function veniceRequest<T>(
  endpoint: string,
  body: any
): Promise<T> {
  const response = await fetch(`${VENICE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `Venice API error (${response.status})`;
    try {
      const err = JSON.parse(text);
      errorMessage = err.error || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Make a chat completion request to Venice AI.
 */
export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  return veniceRequest<ChatCompletionResponse>("/chat/completions", request);
}

// ── Verification Prompts ─────────────────────────────────────────────────

/**
 * Verify that a PR resolves a bounty issue.
 */
export async function verifyPRForBounty(
  issueDescription: string,
  prDescription: string,
  prDiff: string,
  repoName: string
): Promise<BountyVerificationResult> {
  const systemPrompt = `You are an AI code review agent for PRaise, a bounty platform.
Your job is to verify that a Pull Request correctly resolves a GitHub issue.
Analyze the code changes and determine:
1. Does the PR address the issue requirements?
2. Is the code quality acceptable?
3. Are there any security concerns?

Return your analysis as JSON matching this schema:
{
  "isPRValid": boolean,
  "confidence": number (0-1),
  "score": { "score": number, "maxScore": 100, "explanation": string, "codeQuality": number, "relevanceToIssue": number, "completeness": number, "potentialIssues": string[], "suggestions": string[] },
  "summary": string,
  "passedAutomatedChecks": boolean
}`;

  const response = await chatCompletion({
    model: REASONING_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `## Repository\n${repoName}\n\n## Issue Description\n${issueDescription}\n\n## PR Description\n${prDescription}\n\n## Code Changes (Diff)\n\`\`\`diff\n${prDiff.slice(0, 8000)}\n\`\`\`\n\nAnalyze if this PR correctly resolves the issue. Return JSON.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as BountyVerificationResult;
}

/**
 * Score a contributor's PR for bounty payout calculation.
 * Returns a score out of 100 based on code quality, completeness, and relevance.
 */
export async function scoreContribution(
  issueDescription: string,
  prDescription: string,
  prDiff: string
): Promise<PRReviewScore> {
  const response = await chatCompletion({
    model: REASONING_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a fair code reviewer. Score contributions on code quality, relevance to the issue, and completeness. Return JSON only.",
      },
      {
        role: "user",
        content: `Issue: ${issueDescription}\n\nPR: ${prDescription}\n\nCode:\n\`\`\`diff\n${prDiff.slice(0, 8000)}\n\`\`\`\n\nScore this contribution (0-100). Return JSON with keys: score, maxScore, explanation, codeQuality, relevanceToIssue, completeness, potentialIssues[], suggestions[].`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as PRReviewScore;
}

/**
 * Analyze a dispute based on the issue, PR, and evidence.
 * Returns a recommendation for resolution.
 */
export async function analyzeDispute(
  issueDescription: string,
  prDescription: string,
  contributorReason: string,
  creatorReason: string
): Promise<{
  recommendation: "contributor_wins" | "creator_wins" | "partial";
  confidence: number;
  reasoning: string;
}> {
  const response = await chatCompletion({
    model: REASONING_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an impartial bounty dispute resolver. Analyze the evidence from both sides and recommend a fair resolution. Return JSON only.",
      },
      {
        role: "user",
        content: `Issue: ${issueDescription}\n\nPR: ${prDescription}\n\nContributor's argument:\n${contributorReason}\n\nCreator's argument:\n${creatorReason}\n\nWho should win this dispute? Return JSON: { recommendation: "contributor_wins"|"creator_wins"|"partial", confidence: 0-1, reasoning: string }`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_completion_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

/**
 * Analyze GitHub issue text to extract structured bounty metadata.
 */
export async function analyzeIssue(
  issueTitle: string,
  issueBody: string
): Promise<{
  estimatedDifficulty: "easy" | "medium" | "hard";
  suggestedLabels: string[];
  estimatedEffort: string;
  suggestedAmount: number;
}> {
  const response = await chatCompletion({
    model: FAST_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You analyze GitHub issues for a bounty platform. Estimate difficulty, effort, and suggest a bounty amount. Return JSON only.",
      },
      {
        role: "user",
        content: `Issue: ${issueTitle}\n\n${issueBody.slice(0, 4000)}\n\nReturn JSON with estimatedDifficulty (easy/medium/hard), suggestedLabels[], estimatedEffort (e.g. "2-4 hours"), suggestedAmount (USDC, number).`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

// ── Models Discovery ─────────────────────────────────────────────────────

export interface VeniceModel {
  id: string;
  model_spec: {
    name: string;
    capabilities: {
      supportsFunctionCalling?: boolean;
      supportsVision?: boolean;
      supportsReasoning?: boolean;
      supportsWebSearch?: boolean;
    };
    pricing?: {
      input: { usd: number };
      output: { usd: number };
    };
    constraints?: {
      maxCompletionTokens?: number;
    };
  };
}

/**
 * List available models from Venice AI.
 */
export async function listModels(
  type: string = "text"
): Promise<VeniceModel[]> {
  const response = await fetch(
    `${VENICE_BASE_URL}/models?type=${type}`,
    {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Venice models API error: ${response.status}`);
  }

  const json = await response.json();
  return json.data as VeniceModel[];
}

// ── Agent Orchestration ──────────────────────────────────────────────────

/**
 * AI Agent that decides the next action in the bounty lifecycle.
 */
export async function agentDecideNextAction(params: {
  bountyId: number;
  status: string;
  hasPR: boolean;
  prMerged: boolean;
  contestPeriodEnded: boolean;
  hasDispute: boolean;
}): Promise<{
  action: "release" | "wait" | "reclaim" | "escalate" | "dispute";
  reason: string;
}> {
  const response = await chatCompletion({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an AI agent managing bounties on PRaise. Given the bounty state, decide the next action. Return: { action: 'release'|'wait'|'reclaim'|'escalate'|'dispute', reason: string }",
      },
      {
        role: "user",
        content: JSON.stringify(params),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}
