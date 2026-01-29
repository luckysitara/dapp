// src/screens/CommunityFeedScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Alert, TouchableOpacity, TextInput, RefreshControl, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp, RouteProp } from '@react-navigation/stack';
import { RootStackParamList } from '@/shared/navigation/RootNavigator';
import { SQLiteService, CommunityPost, Community } from '@/shared/services/SQLiteService';
import { AppHeader } from '@/core/shared-ui';
import COLORS from '@/assets/colors';
import Icons from '@/assets/svgs';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import { PublicKey } from '@solana/web3.js';
import { findDisplayName } from '@bonfida/spl-name-service';
import { Connection } from '@solana/web3.js';
import { CLUSTER } from '@env';
import * as nacl from 'tweetnacl';
import { util } from 'tweetnacl';
import { v4 as uuidv4 } from 'uuid';
import { FlashList } from '@shopify/flash-list'; // For constraint: Use FlashList
import socketService from '@/shared/services/socketService'; // Import socketService

type CommunityFeedRouteProp = RouteProp<RootStackParamList, 'CommunityFeedScreen'>;
type CommunityFeedNavigationProp = StackNavigationProp<RootStackParamList, 'CommunityFeedScreen'>;

const { width } = Dimensions.get('window');

// Helius DAS API endpoint based on the cluster
const HELIUS_DAS_URL = `https://${CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
// Note: In a real app, HELIUS_API_KEY should be loaded securely and not directly in client code.
// For development/testing, it can be from a .env file.
// For production, consider fetching from a backend or using a proxy.
// Also, the URL should dynamically change based on the CLUSTER environment variable.

const CommunityFeedScreen: React.FC = () => {
  const navigation = useNavigation<CommunityFeedNavigationProp>();
  const route = useRoute<CommunityFeedRouteProp>();
  const { communityId, communityName, isPrivate, gatingMint } = route.params;

  const { connected, publicKey, signMessage } = useWallet();
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingNames, setResolvingNames] = useState<{ [key: string]: boolean }>({});
  const [isMember, setIsMember] = useState(false);

  const connection = new Connection(CLUSTER || 'https://api.mainnet-beta.solana.com');

  const fetchCommunityAndPosts = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      await SQLiteService.initDb(); // Ensure DB is initialized
      const currentCommunity = await SQLiteService.getCommunityById(communityId);
      if (currentCommunity) {
        setCommunity(currentCommunity);
        setIsMember(currentCommunity.is_member === 1);
      }

      // Fetch posts from local DB first
      const localPosts = await SQLiteService.getCommunityPosts(communityId);
      setPosts(localPosts);
      console.log('Fetched local community posts:', localPosts.length);

      // TODO: Fetch from relay server and reconcile
      const response = await fetch(`http://localhost:8080/api/communities/${communityId}/posts`); // Placeholder
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const remotePosts: CommunityPost[] = await response.json();
      console.log('Fetched remote community posts:', remotePosts.length);

      // For simplicity, just replace local posts with remote ones for now.
      // In a real app, merge and reconcile.
      setPosts(remotePosts);
      for (const post of remotePosts) {
        await SQLiteService.insertCommunityPost(post);
      }
    } catch (error) {
      console.error('Failed to fetch community data:', error);
      Alert.alert('Error', 'Failed to load community feed. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId]);

  const resolveAuthorNames = useCallback(async (postsToResolve: CommunityPost[]) => {
    for (const post of postsToResolve) {
      if (!post.author_name && !resolvingNames[post.author_public_key]) {
        setResolvingNames(prev => ({ ...prev, [post.author_public_key]: true }));
        try {
          const name = await findDisplayName(connection, new PublicKey(post.author_public_key));
          const resolvedName = name?.name || post.author_public_key.slice(0, 6) + '...';
          setPosts(prevPosts =>
            prevPosts.map(p =>
              p.id === post.id ? { ...p, author_name: resolvedName } : p
            )
          );
          // Update local DB
          // Note: SQLiteService.insertCommunityPost does an UPSERT, so this will update.
          await SQLiteService.insertCommunityPost({ ...post, author_name: resolvedName });
        } catch (error) {
          console.error(`Failed to resolve name for ${post.author_public_key}:`, error);
          setPosts(prevPosts =>
            prevPosts.map(p =>
              p.id === post.id ? { ...p, author_name: post.author_public_key.slice(0, 6) + '...' } : p
            )
          );
        } finally {
          setResolvingNames(prev => ({ ...prev, [post.author_public_key]: false }));
        }
      }
    }
  }, [connection, resolvingNames]);

  useEffect(() => {
    fetchCommunityAndPosts();
  }, [fetchCommunityAndPosts]);

  useEffect(() => {
    if (posts.length > 0) {
      resolveAuthorNames(posts);
    }
  }, [posts, resolveAuthorNames]);

  // WebSocket management for community feed
  useEffect(() => {
    if (!communityId) return;

    // Only join if the user is a member
    if (isMember) {
      console.log(`[CommunityFeedScreen] Joining WebSocket room for community: ${communityId}`);
      socketService.joinCommunityFeed(communityId);

      // Listener for incoming community posts
      const handleCommunityPostReceived = (receivedPost: CommunityPost) => {
        console.log('[CommunityFeedScreen] Received real-time community post:', receivedPost);
        // Add to state and SQLite. SQLiteService.insertCommunityPost does an UPSERT.
        setPosts(prevPosts => {
          // Prevent duplicates if already optimistically added
          if (prevPosts.some(p => p.id === receivedPost.id)) {
            return prevPosts;
          }
          return [receivedPost, ...prevPosts];
        });
        SQLiteService.insertCommunityPost(receivedPost)
          .then(() => resolveAuthorNames([receivedPost])) // Resolve name for the new post
          .catch(error => console.error('Error inserting received community post into SQLite:', error));
      };

      socketService.subscribeToEvent('community_post_received', handleCommunityPostReceived);

      return () => {
        console.log(`[CommunityFeedScreen] Leaving WebSocket room for community: ${communityId}`);
        socketService.leaveCommunityFeed(communityId);
        socketService.unsubscribeFromEvent('community_post_received', handleCommunityPostReceived);
      };
    }
  }, [communityId, isMember, resolveAuthorNames]);

  const handlePost = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }
    if (!isMember) {
      Alert.alert('Error', 'You must be a member to post in this community.');
      return;
    }
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Post content cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      const postId = uuidv4();
      const postTimestamp = Date.now();
      const messageToSign = `${newPostContent}-${postTimestamp}-${communityId}`;

      const messageUint8 = util.decodeUTF8(messageToSign);
      const signatureUint8 = await signMessage(messageUint8);
      const signature = util.encodeBase64(signatureUint8);

      const newPost: CommunityPost = {
        id: postId,
        community_id: communityId,
        author_public_key: publicKey.toBase58(),
        content: newPostContent,
        signature: signature,
        timestamp: postTimestamp,
        likes_count: 0,
        reposts_count: 0,
        is_liked_by_me: 0,
        is_reposted_by_me: 0,
        author_name: publicKey.toBase58().slice(0, 6) + '...', // Optimistic name
        is_moderated: 0,
      };

      // Optimistically update UI
      setPosts(prevPosts => [newPost, ...prevPosts]);
      setNewPostContent('');
      await SQLiteService.insertCommunityPost(newPost); // Store locally immediately

      // Send post via WebSocket
      socketService.sendCommunityPost(communityId, newPost);
      Alert.alert('Success', 'Post created in community (via WebSocket)!');
    } catch (error: any) {
      console.error('Failed to create community post:', error);
      Alert.alert('Error', error.message || 'Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signMessage, newPostContent, communityId, isMember, resolveAuthorNames]);

  const handleJoinCommunity = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }

    setLoading(true);
    try {
      // 1. Implement Helius DAS API check for 'gatingMint' if private
      if (isPrivate && gatingMint) {
        console.log(`Checking Helius DAS for gating mint: ${gatingMint} for user: ${publicKey.toBase58()}`);
        // TODO: Replace with actual Helius DAS API call
        const hasGatingToken = await checkHeliusDASForToken(publicKey.toBase58(), gatingMint);
        if (!hasGatingToken) {
          Alert.alert('Access Denied', 'You do not hold the required token to join this private community.');
          return;
        }
      }

      // 2. Simulate sending join request to relay server
      console.log('Simulating sending join request to relay server:', { communityId, user: publicKey.toBase58() });
      const response = await fetch(`http://localhost:8080/api/communities/${communityId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userPublicKey: publicKey.toBase58() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join community on server.');
      }

      // 3. Update local DB membership status
      await SQLiteService.updateCommunityMembership(communityId, 1);
      setIsMember(true);
      Alert.alert('Success', `You have joined "${communityName}"!`);
      // TODO: Implement logic to subscribe to WebSocket message stream
    } catch (error: any) {
      console.error('Failed to join community:', error);
      Alert.alert('Error', error.message || 'Failed to join community. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, communityId, communityName, isPrivate, gatingMint]);

  /**
   * Checks the Helius DAS API to see if a wallet holds a specific token mint.
   * @param walletAddress The public key of the user's wallet.
   * @param mintAddress The mint address of the gating token.
   * @returns A promise that resolves to true if the wallet holds the token, false otherwise.
   */
  const checkHeliusDASForToken = useCallback(async (walletAddress: string, mintAddress: string): Promise<boolean> => {
    // NOTE: HELIUS_API_KEY should be loaded securely (e.g., from a backend endpoint
    // or environment variable) and not hardcoded in a production client-side app.
    // For this example, we assume HELIUS_API_KEY is available via @env.
    if (!HELIUS_API_KEY) {
      console.warn('HELIUS_API_KEY is not set. Skipping Helius DAS check and returning true.');
      return true;
    }
    
    // Choose the Helius endpoint based on the cluster (for now, always mainnet for DAS example)
    const dasUrl = `https://${CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    try {
      const response = await axios.post(dasUrl, {
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1, // Pagination for results
          limit: 1000, // Max assets to check
          displayOptions: {
            showUnwrapped: true,
          }
        },
      });

      const assets = response.data.result.items;
      const holdsToken = assets.some((asset: any) => asset.mint === mintAddress);

      console.log(`Helius DAS check for ${walletAddress} holding ${mintAddress}: ${holdsToken}`);
      return holdsToken;
    } catch (error) {
      console.error('Error checking Helius DAS for token:', error);
      // It's safer to deny access if there's an error reaching the DAS API.
      Alert.alert('Error', 'Failed to verify token ownership due to API error. Please try again.');
      return false;
    }
  }, [HELIUS_API_KEY, CLUSTER]); // Depend on HELIUS_API_KEY and CLUSTER

  const handleEngagement = useCallback(async (postId: string, action: 'like' | 'repost', currentPost: CommunityPost) => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }
    if (!isMember) {
      Alert.alert('Error', 'You must be a member to engage with posts in this community.');
      return;
    }

    try {
      const messageToSign = `${postId}-${action}-${communityId}`;
      const messageUint8 = util.decodeUTF8(messageToSign);
      const signatureUint8 = await signMessage(messageUint8);
      const signature = util.encodeBase64(signatureUint8);

      // Optimistically update UI
      const optimisticPosts = posts.map(p => {
        if (p.id === postId) {
          if (action === 'like') {
            return { ...p, likes_count: p.likes_count + 1, is_liked_by_me: 1 };
          } else {
            return { ...p, reposts_count: p.reposts_count + 1, is_reposted_by_me: 1 };
          }
        }
        return p;
      });
      setPosts(optimisticPosts);

      // Simulate sending engagement to relay server
      const response = await fetch(`http://localhost:8080/api/communities/${communityId}/posts/${postId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPublicKey: publicKey.toBase58(),
          signature: signature,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} post`);
      }

      // Update local DB with new counts (relay server might send back final counts)
      const updatedPost = await SQLiteService.getCommunityPostById(postId); // Assuming this function exists or fetch updated post
      if (updatedPost) {
        await SQLiteService.updateCommunityPostEngagement(
          postId,
          action === 'like' ? currentPost.likes_count + 1 : currentPost.likes_count,
          action === 'repost' ? currentPost.reposts_count + 1 : currentPost.reposts_count,
          action === 'like' ? 1 : currentPost.is_liked_by_me,
          action === 'repost' ? 1 : currentPost.is_reposted_by_me
        );
      }
    } catch (error: any) {
      console.error(`Failed to ${action} post:`, error);
      Alert.alert('Error', error.message || `Failed to ${action} post. Please try again.`);
      // Revert optimistic update on error
      fetchCommunityAndPosts(); // Re-fetch to revert to actual state
    }
  }, [connected, publicKey, signMessage, communityId, isMember, posts, fetchCommunityAndPosts]);


  const handleModeratePost = useCallback(async (postId: string, action: 'delete' | 'report', authorPublicKey: string) => {
    if (!connected || !publicKey || publicKey.toBase58() !== community?.creator_public_key) {
      Alert.alert('Permission Denied', 'Only the community creator can moderate posts.');
      return;
    }

    // Only allow deletion for the creator of the community
    if (action === 'delete' && publicKey.toBase58() !== community?.creator_public_key) {
      Alert.alert('Permission Denied', 'Only the community creator can delete posts.');
      return;
    }

    setLoading(true);
    try {
      const messageToSign = `${postId}-${action}-${communityId}`;
      const messageUint8 = util.decodeUTF8(messageToSign);
      const signatureUint8 = await signMessage(messageUint8);
      const signature = util.encodeBase64(signatureUint8);

      // Simulate sending moderation action to relay server
      const response = await fetch(`http://localhost:8080/api/communities/${communityId}/posts/${postId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moderatorPublicKey: publicKey.toBase58(),
          action: action,
          signature: signature,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} post`);
      }

      // Update local DB: mark as moderated or delete
      if (action === 'delete') {
        await SQLiteService.deleteCommunityPost(postId);
        setPosts(prevPosts => prevPosts.filter(p => p.id !== postId));
      } else if (action === 'report') {
        await SQLiteService.updateCommunityPostModeration(postId, 1);
        setPosts(prevPosts => prevPosts.map(p => p.id === postId ? { ...p, is_moderated: 1 } : p));
      }

      Alert.alert('Success', `Post ${action === 'delete' ? 'deleted' : 'reported'}!`);
    } catch (error: any) {
      console.error(`Failed to moderate post:`, error);
      Alert.alert('Error', error.message || `Failed to ${action} post. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signMessage, communityId, community?.creator_public_key]);


  const renderPost = ({ item }: { item: CommunityPost }) => (
    <View style={styles.postContainer}>
      <Text style={styles.postAuthor}>{item.author_name || item.author_public_key.slice(0, 6) + '...'}</Text>
      <Text style={styles.postContent}>{item.content}</Text>
      {item.is_moderated === 1 && <Text style={styles.moderatedText}>[This post has been moderated]</Text>}
      <View style={styles.postActions}>
        <TouchableOpacity onPress={() => handleEngagement(item.id, 'like', item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>👍 {item.likes_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleEngagement(item.id, 'repost', item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>🔁 {item.reposts_count}</Text>
        </TouchableOpacity>

        {community?.creator_public_key === publicKey?.toBase58() && (
          <TouchableOpacity onPress={() => handleModeratePost(item.id, 'delete', item.author_public_key)} style={[styles.actionButton, styles.moderateButton]}>
            <Text style={styles.moderateButtonText}>🗑️ Delete</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.postTimestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        title={communityName}
        showBackButton={true}
        RightIcon={!isMember && (
          <TouchableOpacity onPress={handleJoinCommunity} disabled={loading} style={styles.joinButton}>
            <Text style={styles.joinButtonText}>{loading ? 'Joining...' : 'Join'}</Text>
          </TouchableOpacity>
        )}
      />
      {loading && !refreshing && (
        <ActivityIndicator size="large" color={COLORS.brandPrimary} style={styles.loadingIndicator} />
      )}
      {!isMember && !loading && (
        <View style={styles.notMemberContainer}>
          <Text style={styles.notMemberText}>You are not a member of this community.</Text>
          {isPrivate && gatingMint && (
             <Text style={styles.notMemberText}>Requires token: {gatingMint.slice(0, 8)}...</Text>
          )}
          <TouchableOpacity onPress={handleJoinCommunity} disabled={loading} style={styles.largeJoinButton}>
            <Text style={styles.largeJoinButtonText}>{loading ? 'Joining...' : 'Join Community'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {isMember && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Adjust as needed
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.newPostContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Post something in this community..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              value={newPostContent}
              onChangeText={setNewPostContent}
              editable={!loading && isMember}
            />
            <Button title="Post" onPress={handlePost} disabled={!newPostContent.trim() || loading || !isMember} color={COLORS.brandPrimary} />
          </View>
          <FlashList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            estimatedItemSize={150} // Important for FlashList performance
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={fetchCommunityAndPosts}
                tintColor={COLORS.brandPrimary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No posts in this community yet.</Text>
                <Text style={styles.emptySubtext}>Be the first to post!</Text>
              </View>
            }
            contentContainerStyle={styles.postListContent}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingIndicator: {
    marginTop: 20,
  },
  notMemberContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notMemberText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  largeJoinButton: {
    backgroundColor: COLORS.brandPrimary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    marginTop: 20,
  },
  largeJoinButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  joinButton: {
    backgroundColor: COLORS.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
  },
  joinButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  newPostContainer: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardBackground,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    color: COLORS.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  postListContent: {
    padding: 10,
  },
  postContainer: {
    backgroundColor: COLORS.cardBackground,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    width: width - 20, // Adjust for padding
    alignSelf: 'center',
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
  moderatedText: {
    fontSize: 12,
    color: COLORS.red,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  postTimestamp: {
    fontSize: 12,
    color: COLORS.textFaded,
    textAlign: 'right',
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
  moderateButton: {
    backgroundColor: COLORS.red,
  },
  moderateButtonText: {
    color: COLORS.white,
    marginLeft: 5,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    marginBottom: 10,
  },
  emptySubtext: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default CommunityFeedScreen;
