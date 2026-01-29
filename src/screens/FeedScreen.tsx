import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, SafeAreaView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import { PublicKey } from '@solana/web3.js';
import { findDisplayName } from '@bonfida/spl-name-service';
import { Connection } from '@solana/web3.js';
import { CLUSTER } from '@env';
import nacl from 'tweetnacl';
import { util } from 'tweetnacl';
import COLORS from '@/assets/colors';

// Define the data structure for a Post
interface Post {
  id: string; // Server-generated ID
  author: string; // Public Key of the author
  authorName?: string; // Resolved .sol/.skr handle or truncated public key
  content: string;
  signature: string; // Base64 encoded signature of the content
  timestamp: number;
  likesCount: number; // New: Number of likes
  repostsCount: number; // New: Number of reposts
}

const FeedScreen: React.FC = () => {
  const { connected, publicKey, signMessage } = useWallet();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolvingNames, setResolvingNames] = useState<{ [key: string]: boolean }>({});

  const connection = new Connection(CLUSTER || 'https://api.mainnet-beta.solana.com');

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8080/api/feed/posts');
      const data: Post[] = await response.json();
      setPosts(data);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      Alert.alert('Error', 'Failed to load posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveAuthorNames = useCallback(async (postsToResolve: Post[]) => {
    for (const post of postsToResolve) {
      if (!post.authorName && !resolvingNames[post.author]) {
        setResolvingNames(prev => ({ ...prev, [post.author]: true }));
        try {
          const name = await findDisplayName(connection, new PublicKey(post.author));
          setPosts(prevPosts =>
            prevPosts.map(p =>
              p.id === post.id ? { ...p, authorName: name?.name || p.author.slice(0, 6) + '...' } : p
            )
          );
        } catch (error) {
          console.error(`Failed to resolve name for ${post.author}:`, error);
          setPosts(prevPosts =>
            prevPosts.map(p =>
              p.id === post.id ? { ...p, authorName: p.author.slice(0, 6) + '...' } : p
            )
          );
        } finally {
          setResolvingNames(prev => ({ ...prev, [post.author]: false }));
        }
      }
    }
  }, [connection, resolvingNames]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (posts.length > 0) {
      resolveAuthorNames(posts);
    }
  }, [posts, resolveAuthorNames]);

  const handlePost = async () => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Post content cannot be empty.');
      return;
    }

    try {
      const postTimestamp = Date.now();
      const messageToSign = `${newPostContent}-${postTimestamp}`;
      const message = util.decodeUTF8(messageToSign);
      const signatureUint8 = await signMessage(message);
      const signature = util.encodeBase64(signatureUint8);

      const postData: Omit<Post, 'id' | 'authorName' | 'likesCount' | 'repostsCount'> = {
        author: publicKey.toBase58(),
        content: newPostContent,
        signature: signature,
        timestamp: postTimestamp,
      };

      const response = await fetch('http://localhost:8080/api/feed/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
      }

      const newPost: Post = await response.json();
      setPosts(prevPosts => [newPost, ...prevPosts]);
      setNewPostContent('');
      resolveAuthorNames([newPost]);
      Alert.alert('Success', 'Post created!');
    } catch (error: any) {
      console.error('Failed to create post:', error);
      Alert.alert('Error', error.message || 'Failed to create post. Please try again.');
    }
  };

  const handleEngagement = async (postId: string, action: 'like' | 'repost') => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }

    try {
      const messageToSign = postId + action;
      const messageUint8 = util.decodeUTF8(messageToSign);
      const signatureUint8 = await signMessage(messageUint8);
      const signature = util.encodeBase64(signatureUint8);

      const response = await fetch(`http://localhost:8080/api/feed/posts/${postId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: publicKey.toBase58(),
          signature: signature,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} post`);
      }

      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? {
                ...post,
                likesCount: action === 'like' ? post.likesCount + 1 : post.likesCount,
                repostsCount: action === 'repost' ? post.repostsCount + 1 : post.repostsCount,
              }
            : post
        )
      );
      Alert.alert('Success', `Post ${action}d!`);
    } catch (error: any) {
      console.error(`Failed to ${action} post:`, error);
      Alert.alert('Error', error.message || `Failed to ${action} post. Please try again.`);
    }
  };

  const renderPost = ({ item }: { item: Post }) => (
    <View style={styles.postContainer}>
      <Text style={styles.postAuthor}>{item.authorName || item.author.slice(0, 6) + '...'}</Text>
      <Text style={styles.postContent}>{item.content}</Text>
      <View style={styles.postActions}>
        <TouchableOpacity onPress={() => handleEngagement(item.id, 'like')} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>👍 {item.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleEngagement(item.id, 'repost')} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>🔁 {item.repostsCount}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.postTimestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Public Feed</Text>
      </View>
      <View style={styles.newPostContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="What's happening?"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          value={newPostContent}
          onChangeText={setNewPostContent}
        />
        <Button title="Post" onPress={handlePost} disabled={!connected || !newPostContent.trim()} color={COLORS.brandPrimary} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.brandPrimary} style={styles.loadingIndicator} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          onRefresh={fetchPosts}
          refreshing={loading}
          contentContainerStyle={styles.postList}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  newPostContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textInput: {
    backgroundColor: COLORS.cardBackground,
    color: COLORS.textPrimary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  postList: {
    padding: 16,
  },
  postContainer: {
    backgroundColor: COLORS.cardBackground,
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  postAuthor: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  postContent: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  postTimestamp: {
    fontSize: 12,
    color: COLORS.textFaded,
    textAlign: 'right',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  postActions: {
    flexDirection: 'row',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: COLORS.darkerBackground,
  },
  actionButtonText: {
    color: COLORS.textPrimary,
    marginLeft: 5,
    fontWeight: 'bold',
  },
});

export default FeedScreen;
