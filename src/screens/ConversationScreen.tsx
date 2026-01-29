import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import COLORS from '@/assets/colors';
import { EncryptionService } from '@/shared/services/EncryptionService';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import * as SecureStore from 'expo-secure-store';
import * as nacl from 'tweetnacl';
import { util } from 'tweetnacl';

interface Message {
  id: string;
  sender: 'self' | 'other';
  content: string;
  timestamp: number;
}

interface ConversationScreenRouteParams {
  chatId: string;
  chatName: string;
  recipientPublicKey: string; // Public key of the other participant
}

const ConversationScreen: React.FC = () => {
  const route = useRoute();
  const { chatId, chatName, recipientPublicKey } = route.params as ConversationScreenRouteParams;

  const { connected, publicKey, signMessage } = useWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [seekerX25519KeyPair, setSeekerX25519KeyPair] = useState<nacl.BoxKeyPair | null>(null);
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const SECRET_STORE_KEY_PREFIX = 'e2ee-keypair-'; // Prefix for SecureStore keys

  // 1. Load or Generate Seeker's X25519 Key Pair
  useEffect(() => {
    const initializeSeekerKeyPair = async () => {
      if (!publicKey) return;

      setIsInitializing(true);
      const seekerPublicKeyBase58 = publicKey.toBase58();
      const keyStoreId = `${SECRET_STORE_KEY_PREFIX}${seekerPublicKeyBase58}`;

      try {
        let storedSecretKey = await SecureStore.getItemAsync(keyStoreId);
        let keyPair: nacl.BoxKeyPair;

        if (storedSecretKey) {
          // If a key pair exists, load it
          const secretKeyUint8 = util.decodeBase64(storedSecretKey);
          keyPair = nacl.box.keyPair.fromSecretKey(secretKeyUint8);
          console.log('Loaded Seeker X25519 key pair.');
        } else {
          // Otherwise, generate a new one
          keyPair = EncryptionService.generateX25519KeyPair();
          await SecureStore.setItemAsync(keyStoreId, util.encodeBase64(keyPair.secretKey));
          console.log('Generated and stored new Seeker X25519 key pair.');
        }
        setSeekerX25519KeyPair(keyPair);
      } catch (error) {
        console.error('Failed to manage Seeker X25519 key pair:', error);
        Alert.alert('Error', 'Failed to secure your messaging keys.');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSeekerKeyPair();
  }, [publicKey]);

  // 2. Derive Shared Secret
  useEffect(() => {
    const deriveSecret = async () => {
      if (!seekerX25519KeyPair || !recipientPublicKey) {
        setSharedSecret(null);
        return;
      }

      try {
        // Fetch recipient's X25519 public key (this is a placeholder for now)
        // In a real app, recipientPublicKey might be their Solana public key,
        // and we'd fetch their *associated* X25519 public key from a key server.
        // For this task, we'll assume recipientPublicKey is directly their X25519 public key in Base58 for simplicity
        // or that EncryptionService handles the mapping.
        // For demonstration, let's assume recipientPublicKey is directly the X25519 public key Base58 encoded.
        // OR, if it's a Solana PublicKey, we need to adapt EncryptionService.fetchRecipientX25519PublicKey
        // to actually fetch an X25519 pub key based on a Solana pub key.

        // For now, let's assume recipientPublicKey is the Base58 encoded X25519 public key.
        // In a real app, recipientPublicKey from route params would likely be a Solana PublicKey.
        // This is a point of clarification for the E2EE architecture.
        // For now, we will use a simulated X25519 public key from the recipient.
        const fetchedRecipientX25519PublicKey = await EncryptionService.fetchRecipientX25519PublicKey(recipientPublicKey);
        // If we strictly follow the prompt, recipientPublicKey is the Solana Public Key
        // So we need a way to map Solana PublicKey to X25519 PublicKey

        // For now, let's directly use a generated X25519 key for the recipient for testing the flow
        // In a real implementation, this would be retrieved from a key exchange service
        const simulatedRecipientX25519PublicKey = fetchedRecipientX25519PublicKey; // assuming it returns a Uint8Array X25519 pub key

        const derivedSecret = EncryptionService.deriveSharedSecret(
          seekerX25519KeyPair.secretKey,
          simulatedRecipientX25519PublicKey
        );
        setSharedSecret(derivedSecret);
        console.log('Shared secret derived.');
      } catch (error) {
        console.error('Failed to derive shared secret:', error);
        Alert.alert('Error', 'Failed to establish secure communication.');
      }
    };

    deriveSecret();
  }, [seekerX25519KeyPair, recipientPublicKey]);

  // Handle sending messages
  const handleSendMessage = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected.');
      return;
    }
    if (!inputMessage.trim()) {
      Alert.alert('Error', 'Message cannot be empty.');
      return;
    }
    if (!sharedSecret) {
      Alert.alert('Error', 'Secure channel not established yet.');
      return;
    }

    try {
      // 1. Encrypt payload
      const encryptedPayload = await EncryptionService.encrypt(sharedSecret, inputMessage);

      // 2. Trigger "Double-Tap to Sign" UX
      // The content of the signature doesn't need to be the actual message.
      // It's a "proof of sending" or "confirmation".
      const confirmationMessage = `Confirm E2EE message to ${chatName} at ${Date.now()}`;
      const encodedConfirmationMessage = util.decodeUTF8(confirmationMessage);
      const signatureUint8 = await signMessage(encodedConfirmationMessage);
      const signature = util.encodeBase64(signatureUint8);
      console.log('E2EE message sending confirmed by signature:', signature);

      // 3. Simulate sending encrypted message to SERVER_URL
      // In a real app, this would be an API call to your backend
      console.log('Simulating sending encrypted message:', {
        chatId,
        senderPublicKey: publicKey.toBase58(),
        encryptedPayload, // iv, ciphertext, tag in Base64
        signature, // Proof of sending
        timestamp: Date.now(),
      });

      // For UI, add a temporary placeholder message
      setMessages(prevMessages => [
        ...prevMessages,
        { id: Date.now().toString(), sender: 'self', content: inputMessage, timestamp: Date.now() },
      ]);
      setInputMessage('');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', error.message || 'Failed to send message.');
    }
  }, [connected, publicKey, signMessage, inputMessage, sharedSecret, chatId, chatName]);

  // Simulate receiving a message (for demonstration)
  const simulateReceiveMessage = useCallback(async () => {
    if (!sharedSecret || !seekerX25519KeyPair) return;

    const dummyEncryptedMessage = {
      iv: 'sX/t3e+r4mB6u7g0', // Example IV (Base64 encoded)
      ciphertext: 'someEncryptedTextHere', // Example ciphertext (Base64 encoded)
      tag: 'someAuthTagHere', // Example tag (Base64 encoded)
    };

    try {
      // For a real scenario, this would be an actual encrypted message received from the server
      const decryptedContent = await EncryptionService.decrypt(sharedSecret, dummyEncryptedMessage);
      console.log('Simulated received and decrypted message:', decryptedContent);
      setMessages(prevMessages => [
        ...prevMessages,
        { id: Date.now().toString(), sender: 'other', content: decryptedContent, timestamp: Date.now() },
      ]);
    } catch (error) {
      console.error('Failed to decrypt simulated message:', error);
    }
  }, [sharedSecret, seekerX25519KeyPair]);

  // Basic UI for chat
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{chatName}</Text>
        {isInitializing && <Text style={styles.statusText}>Establishing secure channel...</Text>}
        {!isInitializing && !sharedSecret && <Text style={styles.errorText}>Secure channel failed!</Text>}
        {!isInitializing && sharedSecret && <Text style={styles.statusText}>Secure channel established.</Text>}
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.sender === 'self' ? styles.selfMessage : styles.otherMessage]}>
            <Text style={styles.messageText}>{item.content}</Text>
            <Text style={styles.messageTimestamp}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
          </View>
        )}
        style={styles.messageList}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Adjust as needed
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.textSecondary}
          value={inputMessage}
          onChangeText={setInputMessage}
          editable={!isInitializing && !!sharedSecret}
        />
        <Button
          title="Send"
          onPress={handleSendMessage}
          disabled={!inputMessage.trim() || isInitializing || !sharedSecret}
          color={COLORS.brandPrimary}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statusText: {
    fontSize: 12,
    color: COLORS.green,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.red,
    marginTop: 4,
  },
  messageList: {
    flex: 1,
    padding: 10,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 15,
    marginBottom: 8,
    maxWidth: '80%',
  },
  selfMessage: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.brandPrimary,
    borderBottomRightRadius: 2,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.cardBackground,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    color: COLORS.white,
    fontSize: 15,
  },
  messageTimestamp: {
    fontSize: 10,
    color: COLORS.textFaded,
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    color: COLORS.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    minHeight: 40,
  },
});

export default ConversationScreen;
