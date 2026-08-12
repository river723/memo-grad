import React, { useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Card, Text, Button, Divider } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import StorageService from '../services/StorageService';
import StudyPlanService from '../services/StudyPlanService';
import { AppSettings, Word, StudyRecord } from '../types';
import { useAuth } from '../providers/AuthProvider';
import { format } from 'date-fns';

/**
 * “我的”Tab 入口页：两张功能卡片。
 * - 学习统计：显示关键预览指标 → 点击进入 StatsDetail
 * - 应用设置：显示核心配置摘要 → 点击进入 Settings
 */
export default function StatsScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
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

  const load = useCallback(async () => {
    try {
      const [allWords, allRecords, savedSettings] = await Promise.all([
        StorageService.getWords(),
        StorageService.getStudyRecords(),
        StorageService.getSettings(),
      ]);
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayRecords = await StorageService.getStudyRecordsByDate(today);
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

  const masteryPercent = stats.totalWords > 0
    ? (stats.masteredWords / stats.totalWords) * 100
    : 0;

  const themeLabel =
    settings.theme === 'light' ? '浅色' :
    settings.theme === 'dark' ? '深色' : '跟随系统';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ============ 卡片一：学习统计 ============ */}
      <Card style={styles.card} elevation={2}>
        <Card.Content style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="bar-chart" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>学习统计</Text>
              <Text style={styles.cardSubtitle}>掌握进度 · 学习趋势 · 困难单词</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{stats.totalWords}</Text>
              <Text style={styles.summaryLabel}>总词数</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: colors.success }]}>{stats.masteredWords}</Text>
              <Text style={styles.summaryLabel}>已掌握</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: colors.accent }]}>{stats.weeklyStudyCount}</Text>
              <Text style={styles.summaryLabel}>本周学习</Text>
            </View>
          </View>

          {stats.totalWords > 0 && (
            <>
              <View style={styles.masteryRow}>
                <Text style={styles.masteryLabel}>掌握进度</Text>
                <Text style={styles.masteryValue}>{masteryPercent.toFixed(0)}%</Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${Math.min(masteryPercent, 100)}%`, backgroundColor: colors.success }]} />
              </View>
            </>
          )}

          <Divider style={styles.divider} />

          <View style={styles.miniRow}>
            <View style={styles.miniItem}>
              <MaterialIcons name="today" size={16} color={colors.tertiary} />
              <Text style={styles.miniLabel}>今日学习</Text>
              <Text style={styles.miniValue}>{stats.todayStudyCount}</Text>
            </View>
            <View style={styles.miniItem}>
              <MaterialIcons name="check-circle-outline" size={16} color={colors.tertiary} />
              <Text style={styles.miniLabel}>今日正确率</Text>
              <Text style={[styles.miniValue, { color: colors.success }]}>
                {stats.todayAccuracy.toFixed(0)}%
              </Text>
            </View>
          </View>

          <Button
            mode="contained"
            icon="chart-line"
            onPress={() => navigation.navigate('StatsDetail')}
            style={styles.cardCta}
            contentStyle={styles.cardCtaContent}
          >
            查看完整统计
          </Button>
        </Card.Content>
      </Card>

      {/* ============ 卡片三：账号 ============ */}
      {user && (
        <Card style={styles.card} elevation={2}>
          <Card.Content style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBadge, { backgroundColor: isPro ? colors.primaryContainer : colors.errorContainer }]}>
                <MaterialIcons
                  name={isPro ? 'verified-user' : 'person'}
                  size={22}
                  color={isPro ? colors.primary : colors.error}
                />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>账号</Text>
                <Text style={styles.cardSubtitle}>
                  {user.phone || user.email || '未绑定'}
                </Text>
              </View>
            </View>

            <View style={styles.accountRow}>
              <View style={styles.planBadge}>
                <Text style={[styles.planText, { color: isPro ? colors.primary : colors.onSurfaceVariant }]}>
                  {isPro ? `Pro · ${entitlement?.plan ?? ''}` : '免费版'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.quotaNumber}>
                    {entitlement?.quota.monthlyLimit ?? 0}
                  </Text>
                  <Text style={styles.quotaLabel}>月配额</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[styles.quotaNumber, {
                    color: (entitlement?.quota.remaining ?? 0) > 0 ? colors.success : colors.onSurface,
                  }]}>
                    {entitlement?.quota.remaining ?? 0}
                  </Text>
                  <Text style={styles.quotaLabel}>剩余</Text>
                </View>
              </View>
            </View>

            <Divider style={styles.divider} />

            <Button
              mode={isPro ? 'outlined' : 'contained'}
              icon={isPro ? 'card' : 'star'}
              onPress={() => navigation.navigate('Subscription')}
              style={styles.upgradeCta}
              contentStyle={styles.upgradeCtaContent}
            >
              {isPro ? '管理订阅' : '立即升级到 Pro'}
            </Button>

            {user && user.role === 'admin' && (
              <Button
                mode="text"
                icon="admin"
                onPress={() => navigation.navigate('Admin')}
                style={styles.adminLink}
              >
                进入后台控制台
              </Button>
            )}

            <View style={styles.accountActions}>
              <Button
                mode="outlined"
                icon="logout"
                textColor={colors.error}
                onPress={() => logout()}
                style={{ flex: 1 }}
              >
                退出登录
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}

      {/*** 卡片二：应用设置 ***/}
      <Card style={styles.card} elevation={2}>
        <Card.Content style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: colors.secondaryContainer }]}>
              <MaterialIcons name="settings" size={22} color={colors.secondary} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>应用设置</Text>
              <Text style={styles.cardSubtitle}>外观 · 学习偏好 · AI · 数据备份</Text>
            </View>
          </View>

          <View style={styles.settingPreview}>
            <SettingRow icon="brightness-6" label="主题" value={themeLabel} colors={colors} />
            <SettingRow icon="school" label="每日新词" value={`${settings.dailyNewWords} 个`} colors={colors} />
            <SettingRow icon="format-list-numbered" label="考题题数" value={`${settings.examQuestionCount} 题`} colors={colors} />
          </View>

          <Button
            mode="contained"
            icon="cog"
            onPress={() => navigation.navigate('Settings')}
            style={styles.cardCta}
            contentStyle={styles.cardCtaContent}
          >
            进入设置
          </Button>
        </Card.Content>
      </Card>

      {/* 底部版本信息 */}
      <View style={styles.footer}>
        <MaterialIcons name="menu-book" size={22} color={colors.tertiary} />
        <Text style={styles.footerText}>考研英语生词本AI版</Text>
        <Text style={styles.footerSub}>v1.0.0 · 专注考研 · 科学背词</Text>
      </View>
    </ScrollView>
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

function SettingRow({
  icon,
  label,
  value,
  valueColor,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MaterialIcons name={icon as any} size={18} color={colors.onSurfaceVariant} />
        <Text style={{ fontSize: 14, color: colors.onSurface }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 13, color: valueColor ?? colors.onSurfaceVariant }}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 8,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  cardInner: {
    paddingVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.tertiary,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.outline,
    opacity: 0.4,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.tertiary,
    marginTop: 4,
  },
  masteryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  masteryLabel: {
    fontSize: 12,
    color: colors.tertiary,
  },
  masteryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.primaryContainer,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  divider: {
    marginVertical: 14,
    backgroundColor: colors.outline,
    opacity: 0.4,
  },
  miniRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  miniItem: {
    alignItems: 'center',
    gap: 4,
  },
  miniLabel: {
    fontSize: 11,
    color: colors.tertiary,
  },
  miniValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  settingPreview: {
    marginBottom: 6,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 20,
  },
  planText: {
    fontSize: 13,
    fontWeight: '600',
  },
  quotaNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
  },
  quotaLabel: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 2,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cardCta: {
    marginTop: 16,
    borderRadius: 12,
  },
  cardCtaContent: {
    paddingVertical: 4,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
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
  adminLink: {
    marginTop: 8,
  },
  upgradeCta: {
    marginTop: 4,
  },
  upgradeCtaContent: {
    paddingVertical: 4,
  },
}));
