-- SQLite Schema Sketch for Decentralized Communities & Group Spaces

-- Table for storing community details
CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    creator_public_key TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'public' or 'private'
    gating_mint TEXT, -- NULL for public communities, Solana mint address for private
    created_at INTEGER NOT NULL,
    is_member INTEGER NOT NULL DEFAULT 0 -- 0 for not a member, 1 for verified member
);

-- Table for storing community-specific posts
CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY,
    community_id TEXT NOT NULL,
    author_public_key TEXT NOT NULL,
    content TEXT NOT NULL,
    signature TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    likes_count INTEGER DEFAULT 0,
    reposts_count INTEGER DEFAULT 0,
    is_liked_by_me INTEGER DEFAULT 0, -- Local user engagement
    is_reposted_by_me INTEGER DEFAULT 0, -- Local user engagement
    author_name TEXT, -- Cached resolved name (.sol/.skr)
    is_moderated INTEGER DEFAULT 0, -- Flag for reported/deleted posts
    FOREIGN KEY (community_id) REFERENCES communities (id) ON DELETE CASCADE
);

-- Index for efficient lookup of posts by community
CREATE INDEX IF NOT EXISTS idx_community_posts_community_id ON community_posts (community_id);

-- Index for efficient ordering of posts within a community
CREATE INDEX IF NOT EXISTS idx_community_posts_timestamp ON community_posts (community_id, timestamp DESC);
