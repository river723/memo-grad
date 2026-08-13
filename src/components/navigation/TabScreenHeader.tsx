/**
 * TabScreenHeader —— 4 个 Tab Stack 内部 screenOptions 的统一工厂。
 *
 * 收敛重复的"墨绿 Header + icon + 标题" 4 份工厂代码。
 * 提供：
 *   - 主色背景 + 白色标题
 *   - 可选副标题（如"今日已学 12 / 计划 20"）
 *   - 右侧 slot 自定义
 *   - 返回按钮 + 返回可见控制
 *
 * 用法（在 AppNavigator.tsx 里）：
 *   <Stack.Screen
 *     name="Home"
 *     component={HomeScreen}
 *     options={makeHeaderOptions({ title: '学习', icon: 'menu' })}
 *   />
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { spacing, radius, fontWeight, palette } from '../../theme/tokens';

export interface TabScreenHeaderOptions {
  title: string;
  subtitle?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap | string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function makeHeaderOptions(opts: TabScreenHeaderOptions) {
  return {
    headerTitle: () => <HeaderTitle opts={opts} />,
    headerStyle: undefined as any, // 由 HeaderTitle 内部处理背景
    headerTintColor: palette.onPrimary,
    headerBackTitleVisible: false,
    headerShadowVisible: false,
    header: ({ navigation, options, back }: any) => (
      <HeaderBar opts={opts} navigation={navigation} back={back} />
    ),
  };
}

const HeaderTitle: React.FC<{ opts: TabScreenHeaderOptions }> = ({ opts }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.titleRow}>
      {opts.icon ? (
        <MaterialCommunityIcons
          name={opts.icon as any}
          size={20}
          color={colors.onPrimary}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <View>
        <Text
          style={[
            styles.titleText,
            {
              color: colors.onPrimary,
              fontSize: 17,
              lineHeight: 22,
            },
          ]}
        >
          {opts.title}
        </Text>
        {opts.subtitle ? (
          <Text style={styles.subtitleText}>{opts.subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
};

const HeaderBar: React.FC<{
  opts: TabScreenHeaderOptions;
  navigation: any;
  back: any;
}> = ({ opts, navigation, back }) => {
  const { colors } = useAppTheme();
  const showBack = opts.showBack ?? !!back;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.primary },
      ]}
    >
      {showBack ? (
        <Pressable
          onPress={opts.onBack ?? (() => navigation.goBack())}
          hitSlop={12}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onPrimary} />
        </Pressable>
      ) : null}
      <View style={[styles.titleWrap, !showBack && { paddingLeft: spacing.md }]}>
        <HeaderTitle opts={opts} />
      </View>
      {opts.right ? <View style={styles.rightSlot}>{opts.right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  titleText: { fontWeight: '600' as const, letterSpacing: 0.2 },
  subtitleText: { color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 14, marginTop: 1 },
  rightSlot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
});
