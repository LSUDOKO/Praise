import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // UUID
  username: text("username").notNull().unique(),
  accountAddress: text("account_address"), // EVM address derived from the wallet
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(), // base64url credential ID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64 public key
  credentialType: text("credential_type").notNull(), // "PRF" or "LongBlob"
  counter: integer("counter").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recovery = pgTable("recovery", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedPrivateKey: text("encrypted_private_key").notNull(), // AES ciphertext
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bounties = pgTable("bounties", {
  id: text("id").primaryKey(), // UUID
  bountyId: integer("bounty_id").unique(), // On-chain registered bounty ID
  repo: text("repo").notNull(),
  issueNumber: integer("issue_number").notNull(),
  amount: text("amount").notNull(), // USDC amount (e.g. "100.00")
  bountyAddress: text("bounty_address"), // Deployed Bounty.sol address
  creatorAddress: text("creator_address").notNull(), // Maintainer's Smart Account address
  agentAddress: text("agent_address").notNull(), // Agent address
  status: text("status").default("pending").notNull(), // "pending", "live", "in_review", "releasing", "paid"
  contestPeriod: integer("contest_period").notNull(), // contest period in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
