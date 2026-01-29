// src/shared/background/BackgroundSyncTask.ts

import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { SQLiteService, CommunityPost } from '../services/SQLiteService';
import { EncryptionService } from '../services/EncryptionService';
import { SERVER_URL } from '@env'; // Assuming SERVER_URL is available via @env
import { Buffer } from 'buffer';

const BACKGROUND_SYNC_TASK_NAME = 'BACKGROUND_COMMUNITY_SYNC';

// Define the type for the message structure fetched from the server
interface EncryptedServerMessage {
  id: string;
  chat_room_id?: string; // For E2EE messages
  community_id?: string; // For community posts
  sender_id: string; // Public key of the sender
  created_at: string;
  is_encrypted: boolean;
  // Encrypted payload details
  iv: string;
  ciphertext: string;
  tag: string;
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background sync task encountered an error:', error);
    return;
  }
  if (data) {
    console.log('Background sync task received data:', data);
  }

  console.log('Running background community sync task...');

  try {
    await SQLiteService.initDb(); // Ensure DB is initialized

    const currentSeekerPublicKeyBase58 = await SecureStore.getItemAsync('currentSeekerPublicKey');
    if (!currentSeekerPublicKeyBase558) { // Fixed typo
      console.warn('No current user public key found in SecureStore. Skipping background sync.');
      return;
    }

    // Fetch communities the user is a member of
    const memberCommunities = await SQLiteService.getCommunities(); // This fetches all, needs filtering for is_member=1
    const activeCommunityIds = memberCommunities.filter(c => c.is_member === 1).map(c => c.id);

    if (activeCommunityIds.length === 0) {
      console.log('Not a member of any communities. Skipping background sync.');
      return;
    }

    // TODO: Implement actual logic to fetch missed community posts from the server
    // This would ideally be a dedicated API endpoint like /api/communities/sync
    // that returns new posts since the last sync timestamp.
    // For now, let's simulate fetching posts for each active community.

    for (const communityId of activeCommunityIds) {
      console.log(`Checking for missed posts in community: ${communityId}`);
      try {
        // Fetch new/missed posts for this community
        // This endpoint should ideally return encrypted messages
        const response = await fetch(`${SERVER_URL}/api/communities/${communityId}/sync-posts?lastSyncTime=${Date.now() - (60 * 60 * 1000)}`); // Example: last hour
        if (!response.ok) {
          throw new Error(`Failed to fetch sync posts for community ${communityId}: ${response.status}`);
        }
        const missedPosts: EncryptedServerMessage[] = await response.json();

        if (missedPosts.length > 0) {
          console.log(`Found ${missedPosts.length} missed posts for community ${communityId}.`);
          const seekerX25519SecretKeyBase64 = await SecureStore.getItemAsync(`e2ee-keypair-${currentSeekerPublicKeyBase558}`); // Fixed typo
          if (!seekerX25519SecretKeyBase64) {
            console.error('Seeker X25519 secret key not found for decryption.');
            continue; // Skip this community
          }
          const seekerX25519SecretKey = Buffer.from(seekerX25519SecretKeyBase64, 'base64');

          for (const encryptedPost of missedPosts) {
            try {
              if (encryptedPost.is_encrypted) {
                const senderX25519PublicKey = await EncryptionService.fetchRecipientX25519PublicKey(encryptedPost.sender_id);
                const sharedSecret = EncryptionService.deriveSharedSecret(
                  seekerX25519SecretKey,
                  senderX25519PublicKey
                );
                const decryptedContent = await EncryptionService.decrypt(sharedSecret, {
                  iv: encryptedPost.iv,
                  ciphertext: encryptedPost.ciphertext,
                  tag: encryptedPost.tag,
                });

                // Construct CommunityPost object
                const communityPost: CommunityPost = {
                  id: encryptedPost.id,
                  community_id: communityId,
                  author_public_key: encryptedPost.sender_id,
                  content: decryptedContent,
                  signature: '', // Signature not available in encrypted payload, would need to be stored server-side
                  timestamp: new Date(encryptedPost.created_at).getTime(),
                  likes_count: 0, // Placeholder
                  reposts_count: 0, // Placeholder
                  is_liked_by_me: 0,
                  is_reposted_by_me: 0,
                  author_name: null, // Will be resolved on UI
                  is_moderated: 0,
                };
                await SQLiteService.insertCommunityPost(communityPost);
                console.log(`Decrypted and stored missed post ${communityPost.id}`);
              } else {
                // Handle non-encrypted posts if applicable
                console.log(`Received non-encrypted missed post ${encryptedPost.id}. Storing as is.`);
                const communityPost: CommunityPost = {
                  id: encryptedPost.id,
                  community_id: communityId,
                  author_public_key: encryptedPost.sender_id,
                  content: encryptedPost.content, // Assuming content is plaintext for non-encrypted
                  signature: '', 
                  timestamp: new Date(encryptedPost.created_at).getTime(),
                  likes_count: 0, 
                  reposts_count: 0,
                  is_liked_by_me: 0,
                  is_reposted_by_me: 0,
                  author_name: null, 
                  is_moderated: 0,
                };
                await SQLiteService.insertCommunityPost(communityPost);
              }
            } catch (decryptionError) {
              console.error(`Error decrypting or storing missed post ${encryptedPost.id}:`, decryptionError);
            }
          }
        }
      } catch (communityError) {
        console.error(`Error syncing posts for community ${communityId}:`, communityError);
      }
    }
    console.log('Background community sync task finished.');
  } catch (globalError) {
    console.error('Error in background sync task:', globalError);
  } finally {
    // Return a Promise that resolves to true or false to indicate success/failure
    return Promise.resolve(true); // Indicate success for now
  }
});

export { BACKGROUND_SYNC_TASK_NAME };
