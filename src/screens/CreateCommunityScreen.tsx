// src/screens/CreateCommunityScreen.tsx
import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Button, StyleSheet, SafeAreaView, Alert, ActivityIndicator, TouchableOpacity, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@/shared/navigation/RootNavigator';
import { AppHeader } from '@/core/shared-ui';
import COLORS from '@/assets/colors';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import { SQLiteService, Community } from '@/shared/services/SQLiteService'; // Assuming SQLiteService
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import * as nacl from 'tweetnacl'; // For signing

type CreateCommunityNavigationProp = StackNavigationProp<RootStackParamList, 'CreateCommunityScreen'>;

const CreateCommunityScreen: React.FC = () => {
  const navigation = useNavigation<CreateCommunityNavigationProp>();
  const { connected, publicKey, signMessage } = useWallet();

  const [communityName, setCommunityName] = useState('');
  const [communityType, setCommunityType] = useState<'public' | 'private'>('public');
  const [gatingMint, setGatingMint] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateCommunity = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert('Error', 'Wallet not connected. Please connect your wallet to create a community.');
      return;
    }
    if (!communityName.trim()) {
      Alert.alert('Error', 'Community name cannot be empty.');
      return;
    }
    if (communityType === 'private' && !gatingMint.trim()) {
      Alert.alert('Error', 'Gating Mint is required for private communities.');
      return;
    }

    setLoading(true);
    try {
      const communityId = uuidv4();
      const creatorPublicKey = publicKey.toBase58();
      const timestamp = Date.now();

      // Data to be signed by the creator
      const dataToSign = JSON.stringify({
        id: communityId,
        creator: creatorPublicKey,
        name: communityName.trim(),
        type: communityType,
        gatingMint: communityType === 'private' ? gatingMint.trim() : null,
        timestamp: timestamp,
      });

      // Creator must sign the 'Community Creation' event using the Seed Vault
      const messageUint8 = nacl.util.decodeUTF8(dataToSign);
      const signatureUint8 = await signMessage(messageUint8);
      const signature = nacl.util.encodeBase64(signatureUint8);

      const newCommunity: Community = {
        id: communityId,
        creator_public_key: creatorPublicKey,
        name: communityName.trim(),
        type: communityType,
        gating_mint: communityType === 'private' ? gatingMint.trim() : null,
        created_at: timestamp,
        is_member: 1, // Creator is automatically a member
      };

      // 1. Simulate sending community creation event to the relay server
      console.log('Simulating sending community creation to relay server:', {
        community: newCommunity,
        signature: signature,
      });
      // TODO: Replace with actual API call to relay server
      const response = await fetch('http://localhost:8080/api/communities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ community: newCommunity, signature: signature }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create community on server.');
      }

      // 2. Store the new community locally
      await SQLiteService.insertCommunity(newCommunity);
      Alert.alert('Success', `Community "${communityName}" created!`);
      navigation.goBack(); // Go back to community list
    } catch (error: any) {
      console.error('Failed to create community:', error);
      Alert.alert('Error', error.message || 'Failed to create community. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signMessage, communityName, communityType, gatingMint, navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader title="Create Community" showBackButton={true} />
      <View style={styles.container}>
        <Text style={styles.label}>Community Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter community name"
          placeholderTextColor={COLORS.textSecondary}
          value={communityName}
          onChangeText={setCommunityName}
          editable={!loading}
        />

        <View style={styles.row}>
          <Text style={styles.label}>Community Type: {communityType === 'public' ? 'Public' : 'Private'}</Text>
          <Switch
            trackColor={{ false: COLORS.darkerBackground, true: COLORS.brandPrimary }}
            thumbColor={COLORS.white}
            ios_backgroundColor={COLORS.darkerBackground}
            onValueChange={() => setCommunityType(prev => (prev === 'public' ? 'private' : 'public'))}
            value={communityType === 'private'}
            disabled={loading}
          />
        </View>

        {communityType === 'private' && (
          <>
            <Text style={styles.label}>Gating Mint Address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., So11111111111111111111111111111111111111112"
              placeholderTextColor={COLORS.textSecondary}
              value={gatingMint}
              onChangeText={setGatingMint}
              editable={!loading}
            />
            <Text style={styles.hintText}>Only users holding this token can join private communities.</Text>
          </>
        )}

        <View style={styles.buttonContainer}>
          <Button
            title={loading ? 'Creating...' : 'Create Community'}
            onPress={handleCreateCommunity}
            disabled={loading || !connected || !communityName.trim() || (communityType === 'private' && !gatingMint.trim())}
            color={COLORS.brandPrimary}
          />
        </View>

        {loading && <ActivityIndicator size="large" color={COLORS.brandPrimary} style={styles.activityIndicator} />}
      </View>
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
  label: {
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 8,
    marginTop: 15,
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: COLORS.cardBackground,
    color: COLORS.textPrimary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 15,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.textFaded,
    marginBottom: 10,
  },
  buttonContainer: {
    marginTop: 30,
  },
  activityIndicator: {
    marginTop: 20,
  },
});

export default CreateCommunityScreen;
