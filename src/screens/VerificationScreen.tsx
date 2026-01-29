import React, { useState, useEffect } from 'react';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@/shared/navigation/RootNavigator';
import COLORS from '@/assets/colors';

const SEEKER_GENESIS_TOKEN_MINT = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';

type VerificationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'VerificationScreen'>;

const VerificationScreen: React.FC = () => {
  const [isSeekerDevice, setIsSeekerDevice] = useState(false);
  const [hasGenesisToken, setHasGenesisToken] = useState(false);
  const [verificationAttempted, setVerificationAttempted] = useState(false);
  const navigation = useNavigation<VerificationScreenNavigationProp>();
  const { connected, address } = useWallet();

  useEffect(() => {
    console.log('Performing hardware check...');
    const isSeeker = Platform.OS === 'android' && Platform.constants.Model === 'Seeker' && Platform.constants.Brand === 'solanamobile';
    setIsSeekerDevice(isSeeker);
    console.log(`Device is a Seeker: ${isSeeker}`);
  }, []);

  useEffect(() => {
    const checkToken = async () => {
      if (!isSeekerDevice || !connected || !address) {
        if (!isSeekerDevice) console.log('Not a Seeker device, token check skipped.');
        if (!connected) console.log('Wallet not connected, token check skipped.');
        setVerificationAttempted(true);
        return;
      }

      console.log('Performing on-chain token check...');
      try {
        const response = await fetch('http://localhost:8080/api/gate/check-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ownerAddress: address, mintAddress: SEEKER_GENESIS_TOKEN_MINT }),
        });
        const data = await response.json();
        setHasGenesisToken(data.hasToken);
        console.log(`User has Genesis Token: ${data.hasToken}`);
      } catch (error) {
        console.error('Error checking for Genesis Token:', error);
        setHasGenesisToken(false);
      } finally {
        setVerificationAttempted(true);
      }
    };

    checkToken();
  }, [isSeekerDevice, connected, address]);

  useEffect(() => {
    if (verificationAttempted && isSeekerDevice && hasGenesisToken) {
      navigation.navigate('MainTabs');
    }
  }, [verificationAttempted, isSeekerDevice, hasGenesisToken, navigation]);

  if (!verificationAttempted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Verifying Device and Token...</Text>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!isSeekerDevice) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Seeker Device Required</Text>
        <Text style={styles.subText}>This application can only be used on a Solana Mobile Seeker device.</Text>
      </View>
    );
  }

  if (!hasGenesisToken) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Seeker Genesis Token Required</Text>
        <Text style={styles.subText}>You must hold the Seeker Genesis Token in your wallet to use this app.</Text>
      </View>
    );
  }
  
  // Fallback loading screen while navigating
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Verification Successful, loading...</Text>
      <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    text: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    subText: {
        color: '#999',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
});

export default VerificationScreen;
