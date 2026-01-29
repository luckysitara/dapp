import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { util } from 'tweetnacl';

const router = Router();

// In a real application, you would store posts, likes, and reposts in a database.
// For now, we'll use in-memory arrays.

interface Post {
  id: string;
  author: string;
  content: string;
  signature: string;
  timestamp: number;
  likesCount: number;
  repostsCount: number;
}

interface Engagement {
  id: string;
  postId: string;
  author: string; // Public Key of the user performing the action
  signature: string; // Signature of the action (e.g., postId + actionType)
  timestamp: number;
}

const posts: Post[] = [];
const likes: Engagement[] = [];
const reposts: Engagement[] = [];

// Helper to verify the signature of a post or engagement
const verifySignature = (message: string, signature: string, publicKey: string): boolean => {
  try {
    const messageUint8 = util.decodeUTF8(message);
    const signatureUint8 = util.decodeBase64(signature);
    const publicKeyUint8 = new PublicKey(publicKey).toBytes();

    return nacl.sign.detached.verify(messageUint8, signatureUint8, publicKeyUint8);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};

// GET /api/feed/posts - Retrieve all posts
router.get('/posts', (req: Request, res: Response) => {
  // Enhance posts with current like/repost counts for this request
  const enhancedPosts = posts.map(post => ({
    ...post,
    likesCount: likes.filter(l => l.postId === post.id).length,
    repostsCount: reposts.filter(r => r.postId === post.id).length,
  }));
  res.json(enhancedPosts.sort((a, b) => b.timestamp - a.timestamp)); // Sort by newest first
});

// POST /api/feed/posts - Create a new post
router.post('/posts', (req: Request, res: Response) => {
  const { author, content, signature, timestamp } = req.body;

  if (!author || !content || !signature || !timestamp) {
    return res.status(400).json({ error: 'Missing required post fields' });
  }

  // Verify the signature before adding the post
  if (!verifySignature(content, signature, author)) {
    return res.status(401).json({ error: 'Invalid signature for post content' });
  }

  const newPost: Post = {
    id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    author,
    content,
    signature,
    timestamp,
    likesCount: 0, // Initialize counts
    repostsCount: 0, // Initialize counts
  };

  posts.push(newPost);
  console.log(`New post from ${author} added: ${newPost.id}`);
  res.status(201).json(newPost);
});

// POST /api/feed/posts/:postId/like - Like a post
router.post('/posts/:postId/like', (req: Request, res: Response) => {
  const { postId } = req.params;
  const { author, signature, timestamp } = req.body;

  if (!author || !signature || !timestamp) {
    return res.status(400).json({ error: 'Missing required engagement fields' });
  }

  const post = posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Message to verify for like action: postId + "like"
  const messageToVerify = postId + 'like';
  if (!verifySignature(messageToVerify, signature, author)) {
    return res.status(401).json({ error: 'Invalid signature for like action' });
  }

  // Prevent duplicate likes from the same author on the same post
  const existingLike = likes.find(l => l.postId === postId && l.author === author);
  if (existingLike) {
    return res.status(409).json({ error: 'User already liked this post' });
  }

  const newLike: Engagement = {
    id: `like-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    postId,
    author,
    signature,
    timestamp,
  };
  likes.push(newLike);
  console.log(`Like from ${author} on post ${postId}`);
  res.status(201).json({ success: true, likeId: newLike.id });
});

// POST /api/feed/posts/:postId/repost - Repost a post
router.post('/posts/:postId/repost', (req: Request, res: Response) => {
  const { postId } = req.params;
  const { author, signature, timestamp } = req.body;

  if (!author || !signature || !timestamp) {
    return res.status(400).json({ error: 'Missing required engagement fields' });
  }

  const post = posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Message to verify for repost action: postId + "repost"
  const messageToVerify = postId + 'repost';
  if (!verifySignature(messageToVerify, signature, author)) {
    return res.status(401).json({ error: 'Invalid signature for repost action' });
  }

  // Prevent duplicate reposts from the same author on the same post
  const existingRepost = reposts.find(r => r.postId === postId && r.author === author);
  if (existingRepost) {
    return res.status(409).json({ error: 'User already reposted this post' });
  }

  const newRepost: Engagement = {
    id: `repost-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    postId,
    author,
    signature,
    timestamp,
  };
  reposts.push(newRepost);
  console.log(`Repost from ${author} on post ${postId}`);
  res.status(201).json({ success: true, repostId: newRepost.id });
});

export default router;