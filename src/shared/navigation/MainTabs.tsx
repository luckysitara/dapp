import React, { useState, useRef, useEffect, useMemo, createContext, useContext } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, TouchableOpacity, View, StyleSheet, Animated, Dimensions, Image, Text } from 'react-native';
import { useNavigation, ParamListBase } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';

import Icons from '@/assets/svgs';
import COLORS from '@/assets/colors';
import TYPOGRAPHY from '@/assets/typography';

import AnimatedTabIcon from './AnimatedTabIcon';
import FeedScreen from '@/screens/FeedScreen';
import ConversationScreen from '@/screens/ConversationScreen';
import SwapScreen from '@/modules/swap/screens/SwapScreen';

import { ChatListScreen } from '@/screens/sample-ui/chat';
import ModuleScreen from '@/screens/Common/launch-modules-screen/LaunchModules';

// Create context for scroll-based UI hiding
interface ScrollUIContextType {
  hideTabBar: () => void;
  showTabBar: () => void;
}

const ScrollUIContext = createContext<ScrollUIContextType | null>(null);

export const useScrollUI = () => {
  const context = useContext(ScrollUIContext);
  if (!context) {
    throw new Error('useScrollUI must be used within ScrollUIProvider');
  }
  return context;
};

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get('window');

// Calculate tab positions based on 4-tab layout - adjusted for accuracy
const TAB_WIDTH = width / 4;
const FEED_TAB_CENTER = TAB_WIDTH * 1.5; // Second tab center (0-based index)

const iconStyle = {
  shadowColor: COLORS.black,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 6,
};

export default function MainTabs() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const tabBarTranslateY = useRef(new Animated.Value(0)).current;

  const scrollUIContextValue = useMemo(() => ({
    hideTabBar,
    showTabBar,
  }), []);

  return (
    <ScrollUIContext.Provider value={scrollUIContextValue}>
      {/* Platform Selection Menu - appears above tab bar */}
      <Animated.View
        style={[
          platformStyles.menuContainer,
          {
            transform: [
              { translateY: menuTranslateY },
              { scale: menuScale }
            ],
            opacity: menuOpacity,
          }
        ]}
        pointerEvents={expandedMenu ? 'auto' : 'none'}
      >
        <View style={platformStyles.menuContent}>
          {/* Twitter/Threads Option */}
          <TouchableOpacity
            style={[
              platformStyles.platformButton,
              currentPlatform === 'threads' && platformStyles.activePlatform
            ]}
            onPress={() => selectPlatform('threads')}
          >
            <Image
              source={{ uri: platformIcons.threads }}
              style={platformStyles.platformIcon}
            />
          </TouchableOpacity>

          {/* Instagram Option */}
          <TouchableOpacity
            style={[
              platformStyles.platformButton,
              currentPlatform === 'insta' && platformStyles.activePlatform
            ]}
            onPress={() => selectPlatform('insta')}
          >
            <Image
              source={{ uri: platformIcons.insta }}
              style={platformStyles.platformIcon}
            />
          </TouchableOpacity>

          {/* Chat Option */}
          <TouchableOpacity
            style={[
              platformStyles.platformButton,
              currentPlatform === 'chats' && platformStyles.activePlatform
            ]}
            onPress={() => selectPlatform('chats')}
          >
            <Image
              source={{ uri: platformIcons.chats }}
              style={platformStyles.platformIcon}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Tab.Navigator
        initialRouteName="FeedScreen"
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: COLORS.brandPrimary,
          tabBarStyle: [
            {
              paddingTop: Platform.OS === 'android' ? 5 : 10,
              paddingBottom: Platform.OS === 'android' ? 5 : 0,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              position: 'absolute',
              elevation: 0,
              height: Platform.OS === 'android' ? 55 : 75,
              bottom: Platform.OS === 'android' ? 0 : 0,
              left: 0,
              right: 0,
            },
            {
              transform: [{ translateY: tabBarTranslateY }],
            },
          ],
          tabBarBackground: () => (
            <BlurView
              tint="dark"
              intensity={Platform.OS === 'android' ? 15 : 35}
              style={StyleSheet.absoluteFill}
            >
              <View style={platformStyles.tabBarOverlay} />
            </BlurView>
          ),
        }}>
        <Tab.Screen
          name="FeedScreen"
          component={FeedScreen}
          options={{
            tabBarIcon: ({ focused, size }) => (
              <AnimatedTabIcon
                focused={focused}
                size={size * 1.15}
                icon={
                  Icons.FeedIcon as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                iconSelected={
                  Icons.FeedIconSelected as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                style={{
                  shadowColor: COLORS.black,
                  shadowOffset: { width: 0, height: 15 },
                  shadowOpacity: 0.6,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              />
            ),
          }}
        />
        <Tab.Screen
          name="ChatListScreen"
          component={ChatListScreen}
          options={{
            tabBarIcon: ({ focused, size }) => (
              <AnimatedTabIcon
                focused={focused}
                size={size * 1.25}
                icon={
                  Icons.ChatIcon as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                iconSelected={
                  Icons.ChatIconSelected as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                style={iconStyle}
              />
            ),
          }}
        />
        <Tab.Screen
          name="ConversationScreen"
          component={ConversationScreen}
          options={{
            tabBarIcon: ({ focused, size }) => (
              <AnimatedTabIcon
                focused={focused}
                size={size * 1.25}
                icon={
                  Icons.ChatIcon as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                iconSelected={
                  Icons.ChatIconSelected as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                style={iconStyle}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Modules"
          component={ModuleScreen}
          options={{
            tabBarIcon: ({ focused, size }) => (
              <AnimatedTabIcon
                focused={focused}
                size={size * 1.2}
                icon={
                  Icons.RocketIcon as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                iconSelected={
                  Icons.RocketIconSelected as React.ComponentType<{
                    width: number;
                    height: number;
                  }>
                }
                style={iconStyle}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </ScrollUIContext.Provider>
  );
}


