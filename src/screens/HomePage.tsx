import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useWallet } from '@/modules/wallet-providers/hooks/useWallet';
import { RootStackParamList } from '@/shared/navigation/RootNavigator';
import COLORS from '@/assets/colors';

type HomePageNavigationProp = StackNavigationProp<RootStackParamList, 'HomePage'>;

const HomePage: React.FC = () => {
  const navigation = useNavigation<HomePageNavigationProp>();
  const { connected } = useWallet();

  React.useEffect(() => {
    if (connected) {
      navigation.navigate('VerificationScreen');
    }
  }, [connected, navigation]);

  const handleConnectWallet = () => {
    navigation.navigate('LoginOptions');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image source={{ uri: 'https://solanamobile.com/assets/images/logo-horizontal-dark.svg' }} style={styles.logo} />
        <Text style={styles.appName}>Seeker Messaging</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to the Future of Secure Messaging</Text>
        <Text style={styles.subtitle}>An end-to-end encrypted messaging app for Solana Seeker mobile users.</Text>
      </View>
      <TouchableOpacity style={styles.connectButton} onPress={handleConnectWallet}>
        <Text style={styles.connectButtonText}>Connect Wallet to Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 50,
    resizeMode: 'contain',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 10,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  connectButton: {
    backgroundColor: '#8E44AD',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default HomePage;
