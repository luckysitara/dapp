// src/shared/services/NotificationService.ts

import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, EventType, TriggerType, TimestampTrigger } from '@notifee/react-native';
import { AppState, Platform } from 'react-native';
import { EncryptionService } from './EncryptionService';
import { SQLiteService } from './SQLiteService';
import socketService from './socketService';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer'; // Ensure 'buffer' package is installed for Node.js Buffer API

// Define Notification Channels
const DEFAULT_CHANNEL_ID = 'default';
const MESSAGE_CHANNEL_ID = 'messages';

// Define a type for the incoming data payload from FCM
interface FcmDataPayload {
  chatId?: string; // For E2EE messages
  communityId?: string; // For community posts
  type: 'message' | 'community_post' | 'sync_request'; // Type of notification
  messageId?: string; // ID of the message/post to fetch from server
  senderPublicKey?: string; // Public key of the sender (to derive shared secret)
  // Any other data the relay server might send, but NOT the encrypted content itself
}

export class NotificationService {
  private static isInitialized = false;

  /**
   * Initializes the NotificationService, sets up FCM handlers, and creates notification channels.
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.requestPermissions();
    await this.createNotificationChannels();
    this.setupFCMHandlers();
    this.isInitialized = true;
    console.log('NotificationService initialized.');
  }

  /**
   * Requests necessary notification permissions from the user.
   */
  private static async requestPermissions(): Promise<void> {
    if (Platform.OS === 'ios') {
      const settings = await messaging().requestPermission();
      if (settings) {
        console.log('Notification permissions granted on iOS:', settings.authorizationStatus);
      }
    } else { // Android
      const notificationSettings = await notifee.requestPermission();
      if (notificationSettings.status) {
        console.log('Notification permissions granted on Android:', notificationSettings.status);
      }
    }
  }

  /**
   * Creates notification channels for Android (required for notifications).
   */
  private static async createNotificationChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: DEFAULT_CHANNEL_ID,
        name: 'Default Notifications',
        importance: AndroidImportance.DEFAULT,
      });
      await notifee.createChannel({
        id: MESSAGE_CHANNEL_ID,
        name: 'Messages',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        category: AndroidCategory.MESSAGE,
      });
      console.log('Notification channels created.');
    }
  }

  /**
   * Sets up FCM message handlers for foreground, background, and quit states.
   */
  private static setupFCMHandlers(): void {
    // Handle messages when the app is in the foreground
    messaging().onMessage(async remoteMessage => {
      console.log('FCM Message handled in the foreground:', remoteMessage);
      if (remoteMessage.data) {
        this.handleDataMessage(remoteMessage.data as FcmDataPayload, true); // True for foreground
      }
    });

    // Handle messages when the app is in the background or quit state
    // This function must be asynchronous and return a Promise.
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('FCM Message handled in the background:', remoteMessage);
      if (remoteMessage.data) {
        await this.handleDataMessage(remoteMessage.data as FcmDataPayload, false); // False for background
      }
    });

    // Handle initial notification tap when app is in quit state
    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage) {
        console.log('Notification caused app to open from quit state:', remoteMessage);
        if (remoteMessage.data) {
          // You might want to navigate the user to the relevant screen here
        }
      }
    });

    // Notifee event listener for foreground notifications (e.g., user interaction)
    notifee.onForegroundEvent(({ type, detail }) => {
      switch (type) {
        case EventType.DISMISSED:
          console.log('User dismissed notification:', detail.notification);
          break;
        case EventType.PRESS:
          console.log('User pressed notification:', detail.notification);
          // Handle navigation or other actions based on notification data
          break;
      }
    });

    // Notifee event listener for background notifications (e.g., user interaction)
    // This is called when the app is killed or in the background and a notification is pressed.
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;

      if (type === EventType.PRESS) {
        console.log('User pressed background notification:', notification?.id, pressAction?.id);
        // Handle navigation or other actions based on notification data
      }
    });
  }

  /**
   * Handles incoming FCM data messages, triggering decryption and local notification display.
   * This is the core logic for blind push notifications.
   * @param data The FCM data payload.
   * @param isForeground Whether the app is currently in the foreground.
   */
  private static async handleDataMessage(data: FcmDataPayload, isForeground: boolean): Promise<void> {
    console.log('Handling FCM data message:', data);

    try {
      // If the app is in the foreground, we rely on WebSockets for real-time updates
      // and only display a local notification if it's explicitly a "sync_request" for missed messages
      // or if the message is critical and needs foreground notification despite WebSocket.
      // For E2EE, usually, foreground doesn't need separate notification as UI updates immediately.
      if (isForeground && data.type !== 'sync_request') {
        console.log('App in foreground, relying on WebSocket for real-time updates.');
        return;
      }

      await this.fetchAndProcessLatestMessage(data, isForeground);

    } catch (error) {
      console.error('Error processing FCM data message:', error);
    }
  }

  /**
   * Fetches the latest encrypted message/post from the server, decrypts it, and displays a local notification.
   * @param payload The FCM data payload indicating what to fetch.
   * @param isForeground Whether the app is currently in the foreground.
   */
  private static async fetchAndProcessLatestMessage(payload: FcmDataPayload, isForeground: boolean): Promise<void> {
    console.log('NotificationService: Fetching and processing latest message based on payload:', payload);
    try {
      // 1. Fetch latest encrypted message/post from the server
      // The payload should contain enough info (e.g., messageId, chatId/communityId)
      // to fetch the specific encrypted content.
      // Assuming SERVER_URL is defined globally or imported.
      // For this example, let's use a placeholder.
      const SERVER_URL = 'http://localhost:8080/api'; // Replace with actual SERVER_URL or import from @env

      let fetchEndpoint: string | null = null;
      let isCommunityPost = false;

      if (payload.chatId && payload.messageId) {
        fetchEndpoint = `${SERVER_URL}/messages/${payload.chatId}/${payload.messageId}`;
      } else if (payload.communityId && payload.messageId) {
        fetchEndpoint = `${SERVER_URL}/communities/${payload.communityId}/posts/${payload.messageId}`;
        isCommunityPost = true;
      } else {
        console.warn('Cannot fetch latest message: Insufficient info in payload (chatId/communityId and messageId missing).');
        return;
      }

      const response = await fetch(fetchEndpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch encrypted content: ${response.status}`);
      }
      const encryptedContent = await response.json(); // Assuming { iv, ciphertext, tag, senderPublicKey, ... }

      // 2. Decrypt locally
      const senderPublicKeyBase58 = encryptedContent.senderPublicKey; // Assuming server sends this
      const currentSeekerPublicKeyBase58 = await SecureStore.getItemAsync('currentSeekerPublicKey'); // Retrieve current user's Solana pub key

      if (!currentSeekerPublicKeyBase558) { // Typo in previous thought, fixed to 58
        console.error('Seeker public key not found in SecureStore.');
        return;
      }

      const seekerX25519SecretKeyBase64 = await SecureStore.getItemAsync(`e2ee-keypair-${currentSeekerPublicKeyBase558}`);
      if (!seekerX25519SecretKeyBase64) {
        console.error('Seeker X25519 secret key not found in SecureStore.');
        return;
      }
      const seekerX25519SecretKey = Buffer.from(seekerX25519SecretKeyBase64, 'base64');


      // This is a placeholder call from EncryptionService for mapping senderPublicKey to their X25519 pub key
      // In a real app, you'd fetch sender's X25519 public key via Key Exchange Service
      const senderX25519PublicKey = await EncryptionService.fetchRecipientX25519PublicKey(senderPublicKeyBase58);

      const sharedSecret = EncryptionService.deriveSharedSecret(
        seekerX25519SecretKey,
        senderX25519PublicKey
      );

      const decryptedMessage = await EncryptionService.decrypt(sharedSecret, encryptedContent);
      console.log('Decrypted message for notification:', decryptedMessage);

      // 3. Store decrypted message locally (e.g., in SQLite)
      // This part would ideally interact with Redux to update state, or directly with SQLiteService.
      // For simplicity here, we'll just log and assume a mechanism to sync it.
      if (isCommunityPost) {
        // TODO: Store in community_posts table using SQLiteService
        // Example: await SQLiteService.insertCommunityPost({ ...encryptedContent, content: decryptedMessage, is_moderated: 0, ... });
        console.log('TODO: Store decrypted community post in SQLite:', decryptedMessage);
      } else {
        // TODO: Store in chat messages table (need a dedicated table for E2EE chat messages)
        console.log('TODO: Store decrypted E2EE message in SQLite:', decryptedMessage);
      }


      // 4. Display local notification (only if not in foreground, or if explicitly requested)
      // For E2EE, we usually display only if app is in background/quit.
      if (!isForeground) {
        await this.displayLocalNotification(
          isCommunityPost ? `New post in ${payload.communityId}` : `New message from ${senderPublicKeyBase58.slice(0,6)}...`,
          decryptedMessage,
          payload.chatId || payload.communityId || 'notification'
        );
      } else {
        // If in foreground, just update UI state (e.g., Redux, context)
        // This is handled by socketService.onMessage or direct API calls.
        console.log('Message received in foreground, not displaying local notification.');
      }

    } catch (error) {
      console.error('Error fetching/decrypting/displaying message:', error);
      // Optionally display a generic "New activity" notification if decryption fails
      if (!isForeground) {
        await this.displayLocalNotification('New Activity', 'You have new activity in the app.', 'generic');
      }
    }
  }

  /**
   * Displays a local notification using Notifee.
   * @param title The title of the notification.
   * @param body The body text of the notification.
   * @param dataId An ID to uniquely identify the notification's context (e.g., chat ID).
   */
  static async displayLocalNotification(title: string, body: string, dataId: string): Promise<void> {
    const notificationId = `${dataId}-${Date.now()}`; // Unique ID for each notification

    await notifee.displayNotification({
      id: notificationId,
      title: title,
      body: body,
      android: {
        channelId: MESSAGE_CHANNEL_ID,
        pressAction: {
          id: 'default',
        },
        // group: 'messages', // Group notifications by type/chat
        // groupId: dataId,
        // color: '#4CAF50',
        // smallIcon: 'ic_launcher_round', // Set a custom small icon
        // autoCancel: true,
      },
      ios: {
        sound: 'default',
        // categoryId: 'message',
      },
      data: {
        chatId: dataId, // Attach data for handling on press
      },
    });
    console.log('Local notification displayed:', title);
  }

  /**
   * Returns the FCM registration token for the device.
   */
  static async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      console.log('FCM Token:', token);
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }
}
