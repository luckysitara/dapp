// src/screens/CommunityListScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, ActivityIndicator, Alert, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '@/shared/navigation/RootNavigator';
import { SQLiteService, Community } from '@/shared/services/SQLiteService'; // Assuming SQLiteService is in shared/services
import { AppHeader } from '@/core/shared-ui';
import COLORS from '@/assets/colors';
import Icons from '@/assets/svgs';
import { FlashList } from '@shopify/flash-list'; // For constraint: Use FlashList

type CommunityListNavigationProp = StackNavigationProp<RootStackParamList, 'CommunityListScreen'>;

const CommunityListScreen: React.FC = () => {
  const navigation = useNavigation<CommunityListNavigationProp>();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      // 1. Fetch communities from the local SQLite database
      const localCommunities = await SQLiteService.getCommunities();
      setCommunities(localCommunities);
      console.log('Fetched local communities:', localCommunities.length);

      // 2. Implement API call to fetch communities from the relay server
      // TODO: Replace with actual API endpoint and data handling
      const response = await fetch('http://localhost:8080/api/communities'); // Placeholder API call
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const remoteCommunities: Community[] = await response.json();
      console.log('Fetched remote communities:', remoteCommunities.length);

      // For now, let's just use remote communities. In a real app,
      // you'd merge and reconcile local and remote data.
      setCommunities(remoteCommunities);
      // Also update local DB with remote communities
      for (const community of remoteCommunities) {
        await SQLiteService.insertCommunity(community);
      }
      console.log('Updated local DB with remote communities.');
    } catch (error) {
      console.error('Failed to fetch communities:', error);
      Alert.alert('Error', 'Failed to load communities. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initialize DB and fetch communities on mount
    const initAndFetch = async () => {
      await SQLiteService.initDb(); // Ensure DB is initialized
      fetchCommunities();
    };
    initAndFetch();
  }, [fetchCommunities]);

  const handleCreateCommunity = useCallback(() => {
    navigation.navigate('CreateCommunityScreen');
  }, [navigation]);

  const handleCommunityPress = useCallback((community: Community) => {
    // Navigate to CommunityFeedScreen or similar
    navigation.navigate('CommunityFeedScreen', { communityId: community.id, communityName: community.name, isPrivate: community.type === 'private', gatingMint: community.gating_mint });
  }, [navigation]);

  const filteredCommunities = communities.filter(community =>
    community.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCommunityItem = ({ item }: { item: Community }) => (
    <TouchableOpacity style={styles.communityItem} onPress={() => handleCommunityPress(item)}>
      <View style={styles.communityInfo}>
        <Text style={styles.communityName}>{item.name}</Text>
        <Text style={styles.communityType}>{item.type === 'private' ? 'Private' : 'Public'} Community</Text>
        {item.gating_mint && <Text style={styles.gatingMint}>Gated by: {item.gating_mint.slice(0, 8)}...</Text>}
      </View>
      <View style={styles.communityActions}>
        {item.is_member ? (
          <Text style={styles.memberStatus}>Member</Text>
        ) : (
          <Icons.ChevronRight color={COLORS.textSecondary} width={20} height={20} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        title="Communities"
        showBackButton={false}
        RightIcon={
          <TouchableOpacity onPress={handleCreateCommunity} style={styles.createButton}>
            <Icons.PlusCircle color={COLORS.brandPrimary} width={24} height={24} />
          </TouchableOpacity>
        }
      />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search communities..."
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.brandPrimary} style={styles.loadingIndicator} />
      ) : (
        <FlashList
          data={filteredCommunities}
          keyExtractor={(item) => item.id}
          renderItem={renderCommunityItem}
          estimatedItemSize={70} // Important for FlashList performance
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={fetchCommunities}
              tintColor={COLORS.brandPrimary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No communities found.</Text>
              <Text style={styles.emptySubtext}>Be the first to create one!</Text>
            </View>
          }
          contentContainerStyle={styles.listContentContainer}
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
  loadingIndicator: {
    marginTop: 20,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: COLORS.textPrimary,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  communityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  communityInfo: {
    flex: 1,
  },
  communityName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  communityType: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  gatingMint: {
    fontSize: 12,
    color: COLORS.textFaded,
    marginTop: 4,
  },
  communityActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberStatus: {
    color: COLORS.green,
    fontWeight: 'bold',
    marginRight: 5,
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
  createButton: {
    padding: 5,
  },
});

export default CommunityListScreen;
