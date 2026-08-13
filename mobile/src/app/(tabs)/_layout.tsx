import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { tabRoutes } from '@/navigation/tab-routes';
import { colors, spacing, typography } from '@/lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.agronomy,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      {tabRoutes.map((route) => (
        <Tabs.Screen key={route.name} name={route.name} options={{ title: route.title, tabBarAccessibilityLabel: `${route.title} tab`, tabBarButtonTestID: `tab-${route.name}`, tabBarIcon: ({ color }) => <Text importantForAccessibility="no-hide-descendants" style={[styles.icon, { color }]}>{route.icon}</Text> }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 72, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  item: { minHeight: 48 }, label: { ...typography.caption, fontWeight: '600' }, icon: { fontSize: 18, fontWeight: '700', height: 22 },
});
