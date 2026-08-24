import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView, Pressable, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppIcon, { type IconName } from '../components/ds/AppIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { spring } from '../theme/motion';
import { makeStyles } from '../utils/useStyles';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { AppSettings, Word, StudyRecord } from '../types';
import { useAuth } from '../providers/AuthProvider';
import AppButton from '../components/ds/AppButton';
import StatStrip from '../components/ds/StatStrip';
import SectionHeader from '../components/ds/SectionHeader';

const PLAN_LABEL: Record<string, string> = {
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

export default function StatsScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const { user, isPro, entitlement, logout, refreshEntitlement } = useAuth();

  const [stats, setStats] = useState({
    totalWords: 0,
    masteredWords: 0,
    weeklyStudyCount: 0,
    todayStudyCount: 0,
    todayAccuracy: 0,
  });
  const [settings, setSettings] = useState<AppSettings>({
    dailyNewWords: 10,
    reviewInterval: [1, 2, 4, 7, 15],
    soundEnabled: true,
    theme: 'light',
    fontSize: 14,
    autoPlaySound: false,
    showRareSense: true,
    showEtymology: true,
    articleWordCount: 10,
    articleLength: 200,
    examQuestionCount: 10,
    examAutoAdvance: true,
    aiProvider: 'deepseek',
    aiModel: 'deepseek-chat',
    apiKey: '',
  });

  // 进场动效
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(12)).current;

  const load = useCallback(async () => {
    try {
      const [allWords, allRecords, savedSettings] = await Promise.all([
        StorageService.getWords(),
        StorageService.getStudyRecords(),
        StorageService.getSettings(),
      ]);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todayRecords = await StorageService.getStudyRecordsByDate(todayStr);
      const todayStudyCount = todayRecords.length;
      const todayCorrectCount = todayRecords.filter(r => r.result === 1).length;
      const todayAccuracy = todayStudyCount > 0 ? (todayCorrectCount / todayStudyCount) * 100 : 0;

      const studyPlanService = new StudyPlanService();
      const weeklyTrend = await studyPlanService.getWeeklyStudyTrend();
      const weeklyStudyCount = weeklyTrend.reduce((sum, day) => sum + day.studyCount, 0);

      const masteredWords = countMastered(allWords, allRecords);

      setStats({
        totalWords: allWords.length,
        masteredWords,
        weeklyStudyCount,
        todayStudyCount,
        todayAccuracy,
      });
      setSettings(prev => ({ ...prev, ...savedSettings }));
    } catch (error) {
      console.error('Failed to load overview:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshEntitlement();
    }, [load, refreshEntitlement])
  );

  useEffect(() => {
    heroOpacity.setValue(0);
    heroTranslate.setValue(12);
    Animated.parallel([
      Animated.spring(heroOpacity, { toValue: 1, ...spring, useNativeDriver: true }),
      Animated.spring(heroTranslate, { toValue: 0, ...spring, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroTranslate]);

  const masteryPercent = stats.totalWords > 0
    ? (stats.masteredWords / stats.totalWords) * 100
    : 0;

  const themeLabel =
    settings.theme === 'light' ? '浅色' :
    settings.theme === 'dark' ? '深色' : '跟随系统';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {/* Hero：掌握进度环 */}
        <Animated.View
          style={[
            styles.hero,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.xl,
              opacity: heroOpacity,
              transform: [{ translateY: heroTranslate }],
            },
            colors.shadow.card,
          ]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
              我的学习
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text
                style={{
                  color: colors.onPrimary,
                  fontSize: typography.headline.size,
                  lineHeight: typography.headline.lineHeight,
                  fontWeight: '700',
                  letterSpacing: -0.5,
                }}
              >
                {Math.round(masteryPercent)}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodyLg.size, fontWeight: '500' }}>
                % 已掌握
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
              总词 {stats.totalWords} · 今日正确率 {Math.round(stats.todayAccuracy)}%
            </Text>
          </View>
          <ProgressRing progress={masteryPercent / 100} />
        </Animated.View>

        {/* 主 CTA */}
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <AppButton
            title="查看完整统计"
            onPress={() => navigation.navigate('StatsDetail')}
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="chart-line" size={20} color={colors.onPrimary} />}
          />
          <AppButton
            title={isPro ? '管理订阅' : '立即升级到 Pro'}
            onPress={() => navigation.navigate('Subscription')}
            variant={isPro ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            leftIcon={
              isPro
                ? <MaterialCommunityIcons name="card-account-details" size={20} color={colors.primary} />
                : <MaterialCommunityIcons name="star" size={20} color={colors.onPrimary} />
            }
          />
        </View>

        {/* 三指标 */}
        <View style={{ marginTop: spacing.xl }}>
          <StatStrip
            metrics={[
              { value: stats.totalWords, label: '总词数' },
              { value: stats.masteredWords, label: '已掌握', tint: colors.success },
              { value: stats.weeklyStudyCount, label: '本周学习' },
            ]}
          />
        </View>

        {/* 账号卡 */}
        {user && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                borderRadius: radius.lg,
              },
              colors.shadow.hairline,
            ]}
          >
            <View style={styles.accountHeader}>
              <View style={[styles.avatarBadge, { backgroundColor: isPro ? colors.primaryContainer : colors.surfaceVariant }]}>
                <MaterialCommunityIcons
                  name={isPro ? 'crown' : 'account'}
                  size={22}
                  color={isPro ? colors.primary : colors.onSurfaceVariant}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                  {user.phone || user.email || '未绑定'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={[styles.planPill, { backgroundColor: isPro ? colors.primaryContainer : colors.surfaceVariant }]}>
                    <Text style={{ fontSize: typography.caption.size, fontWeight: '700', color: isPro ? colors.primary : colors.onSurfaceVariant }}>
                      {isPro ? `Pro · ${PLAN_LABEL[entitlement?.plan ?? ''] ?? '会员'}` : '免费版'}
                    </Text>
                  </View>
                  {isPro && entitlement?.expiresAt && (
                    <Text style={{ color: colors.tertiary, fontSize: typography.caption.size }}>
                      到期 {new Date(entitlement.expiresAt).toISOString().slice(0, 10)}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {isPro && entitlement && (
              <View style={styles.quotaRow}>
                <View style={styles.quotaItem}>
                  <Text style={styles.quotaNumber}>{entitlement.quota.monthlyLimit ?? 0}</Text>
                  <Text style={styles.quotaLabel}>月配额</Text>
                </View>
                <View style={[styles.quotaDivider, { backgroundColor: colors.outline }]} />
                <View style={styles.quotaItem}>
                  <Text style={[styles.quotaNumber, { color: (entitlement.quota.remaining ?? 0) > 0 ? colors.success : colors.onSurface }]}>
                    {entitlement.quota.remaining ?? 0}
                  </Text>
                  <Text style={styles.quotaLabel}>剩余</Text>
                </View>
              </View>
            )}

            {user.role === 'admin' && (
              <Pressable
                onPress={() => navigation.navigate('Admin')}
                style={({ pressed }) => [styles.adminRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="shield-crown" size={18} color={colors.onSurfaceVariant} />
                <Text style={{ flex: 1, color: colors.onSurface, fontSize: typography.bodySm.size, fontWeight: '500' }}>
                  进入后台控制台
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.tertiary} />
              </Pressable>
            )}
          </View>
        )}

        {/* 应用设置预览 */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="应用设置" actionLabel="进入设置" onAction={() => navigation.navigate('Settings')} icon="cog" />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderColor: colors.outline,
              borderWidth: 1,
              overflow: 'hidden',
            }}
          >
            <SettingPreviewRow icon="brightness-6" label="主题" value={themeLabel} colors={colors} onPress={() => navigation.navigate('Settings')} />
            <SettingPreviewRow icon="school" label="每日新词" value={`${settings.dailyNewWords} 个`} colors={colors} onPress={() => navigation.navigate('Settings')} last={false} />
            <SettingPreviewRow icon="format-list-numbered" label="考题题数" value={`${settings.examQuestionCount} 题`} colors={colors} onPress={() => navigation.navigate('Settings')} last />
          </View>
        </View>

        {/* 退出登录 */}
        <View style={{ marginTop: spacing.xl }}>
          <AppButton
            title="退出登录"
            onPress={() => logout()}
            variant="danger"
            size="lg"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="logout" size={20} color={colors.onPrimary} />}
          />
        </View>

        {/* 版本信息 */}
        <View style={styles.footer}>
          <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.tertiary} />
          <Text style={styles.footerText}>考研英语生词本AI版</Text>
          <Text style={styles.footerSub}>v1.0.0 · 专注考研 · 科学背词</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ---- helpers ---- */

function countMastered(words: Word[], records: StudyRecord[]) {
  let count = 0;
  for (const w of words) {
    const wr = records.filter(r => r.word_id === w.id);
    if (wr.length === 0) continue;
    const correct = wr.filter(r => r.result === 1).length;
    if (correct / wr.length >= 0.8) count++;
  }
  return count;
}

function SettingPreviewRow({
  icon,
  label,
  value,
  colors,
  onPress,
  last = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onPress: () => void;
  last?: boolean;
}) {
  const typography = colors.typography;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderBottomColor: colors.outline,
          borderBottomWidth: last ? 0 : 1,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <AppIcon name={icon} size={18} color={colors.onSurfaceVariant} />
      <Text style={{ flex: 1, color: colors.onSurface, fontSize: typography.body.size }}>{label}</Text>
      <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.bodySm.size, marginRight: 4 }}>{value}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.tertiary} />
    </Pressable>
  );
}

// === 墨绿环图（纯 View + transform，与 HomeScreen 一致） ===
const ProgressRing: React.FC<{ progress: number }> = ({ progress }) => {
  const { colors } = useAppTheme();
  const size = 64;
  const stroke = 6;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'rgba(255,255,255,0.18)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'transparent',
          borderTopColor: colors.onPrimary,
          borderRightColor: progress > 0.25 ? colors.onPrimary : 'transparent',
          borderBottomColor: progress > 0.5 ? colors.onPrimary : 'transparent',
          borderLeftColor: progress > 0.75 ? colors.onPrimary : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }}
      />
      <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 }}>
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
};

const useStyles = makeStyles(colors => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 140,
    gap: 16,
  },
  card: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  quotaItem: {
    flex: 1,
    alignItems: 'center',
  },
  quotaDivider: {
    width: 1,
    height: 32,
    opacity: 0.4,
  },
  quotaNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  quotaLabel: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 2,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 11,
    color: colors.tertiary,
  },
}));
