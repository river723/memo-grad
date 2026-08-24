import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { spring } from '../theme/motion';
import StorageService from '../services/StorageService';
import { ExamSession, WrongQuestion, RealExamSession, RealExamWrongQuestion } from '../types';
import AppButton from '../components/ds/AppButton';
import SectionHeader from '../components/ds/SectionHeader';

/** 统一的"最近练习"视图模型，合并考题与真题两套 session。 */
type RecentItem = {
  key: string;
  createdAt: string;
  label: string;
  count: number;
  accuracy: number; // 0-1
};

export default function PracticeHubScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [realExamSessions, setRealExamSessions] = useState<RealExamSession[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [realExamWrong, setRealExamWrong] = useState<RealExamWrongQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 进场动效
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(12)).current;

  const loadData = useCallback(async () => {
    try {
      const [sessions, realSessions, wrongs, realWrongs] = await Promise.all([
        StorageService.getExamSessions(),
        StorageService.getRealExamSessions(),
        StorageService.getWrongQuestions(),
        StorageService.getRealExamWrongQuestions(),
      ]);
      setExamSessions(sessions);
      setRealExamSessions(realSessions);
      setWrongQuestions(wrongs);
      setRealExamWrong(realWrongs);
    } catch (error) {
      console.error('加载练习数据失败:', error);
      setExamSessions([]);
      setRealExamSessions([]);
      setWrongQuestions([]);
      setRealExamWrong([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    heroOpacity.setValue(0);
    heroTranslate.setValue(12);
    Animated.parallel([
      Animated.spring(heroOpacity, { toValue: 1, ...spring, useNativeDriver: true }),
      Animated.spring(heroTranslate, { toValue: 0, ...spring, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroTranslate]);

  const totalExams = examSessions.length + realExamSessions.length;
  const allAccuracies = [
    ...examSessions.map(s => s.accuracy || 0),
    ...realExamSessions.map(s => (s.total > 0 ? s.score / s.total : 0)),
  ];
  const avgAccuracy = allAccuracies.length > 0
    ? Math.round(allAccuracies.reduce((sum, a) => sum + a, 0) / allAccuracies.length * 100)
    : 0;
  const totalWrong = wrongQuestions.length + realExamWrong.length;

  const recentItems: RecentItem[] = [
    ...examSessions.map(s => ({
      key: `exam-${s.id}`,
      createdAt: s.created_at,
      label: s.question_type === 'definition' ? '释义选择题' : '完形填空题',
      count: s.questions?.length || 0,
      accuracy: s.accuracy || 0,
    })),
    ...realExamSessions.map(s => ({
      key: `real-${s.id}`,
      createdAt: s.createdAt,
      label: `真题·${s.mode === 'reading' ? '阅读' : '完形'} ${s.year}`,
      count: s.total,
      accuracy: s.total > 0 ? s.score / s.total : 0,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const showSpinner = !loaded;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {showSpinner ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.body.size }}>加载中…</Text>
          </View>
        ) : (
          <>
            {/* Hero */}
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
                  练习中心
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
                    {totalExams > 0 ? totalExams : '开始练习'}
                  </Text>
                  {totalExams > 0 && (
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodyLg.size, fontWeight: '500' }}>
                      次练习
                    </Text>
                  )}
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, marginTop: 2 }}>
                  {totalExams > 0
                    ? `平均正确率 ${avgAccuracy}% · ${totalWrong} 题待复习`
                    : 'AI 出题与真题，任选其一开始'}
                </Text>
              </View>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="puzzle" size={26} color={colors.onPrimary} />
              </View>
            </Animated.View>

            {/* 双 CTA */}
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <AppButton
                title="AI 出题练习"
                onPress={() => navigation.navigate('ExamSetup')}
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<MaterialCommunityIcons name="creation" size={20} color={colors.onPrimary} />}
              />
              <AppButton
                title="真题练习"
                onPress={() => navigation.navigate('RealExamList')}
                variant="secondary"
                size="lg"
                fullWidth
                leftIcon={<MaterialCommunityIcons name="book-open-page-variant" size={20} color={colors.primary} />}
              />
            </View>

            {/* 分组入口：AI 题库 / 错题本 */}
            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
              <Pressable
                onPress={() => navigation.navigate('ExamHistory')}
                style={({ pressed }) => [
                  styles.entryRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.outline,
                    borderRadius: radius.lg,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={[styles.entryIcon, { backgroundColor: colors.status.active.bg }]}>
                  <MaterialCommunityIcons name="history" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                    AI 题库
                  </Text>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginTop: 2 }}>
                    {examSessions.length > 0 ? `${examSessions.length} 次 AI 出题记录` : '暂无记录'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate('WrongQuestionReview')}
                style={({ pressed }) => [
                  styles.entryRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.outline,
                    borderRadius: radius.lg,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={[styles.entryIcon, { backgroundColor: colors.status.refunded.bg }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontSize: typography.bodyLg.size, fontWeight: '600' }}>
                    错题本
                  </Text>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: typography.caption.size, marginTop: 2 }}>
                    {totalWrong > 0 ? `${totalWrong} 道错题待复盘` : '暂无错题'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
              </Pressable>
            </View>

            {/* 最近练习 */}
            {recentItems.length > 0 && (
              <View style={{ marginTop: spacing.xl }}>
                <SectionHeader
                  title="最近练习"
                  actionLabel="查看全部"
                  onAction={() => navigation.navigate('ExamHistory')}
                />
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    borderColor: colors.outline,
                    borderWidth: 1,
                    overflow: 'hidden',
                  }}
                >
                  {recentItems.map((item, idx) => (
                    <View
                      key={item.key}
                      style={[
                        styles.sessionRow,
                        {
                          borderBottomColor: colors.outline,
                          borderBottomWidth: idx < recentItems.length - 1 ? 1 : 0,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.onSurface, fontSize: typography.bodySm.size, fontWeight: '500' }}>
                          {item.label}
                        </Text>
                        <Text style={{ color: colors.tertiary, fontSize: typography.caption.size, marginTop: 2 }}>
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString('zh-CN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '未知时间'}
                          {' · '}
                          {item.count} 题
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: typography.bodyLg.size,
                          fontWeight: '700',
                          color: item.accuracy >= 0.7 ? colors.success : colors.danger,
                        }}
                      >
                        {Math.round(item.accuracy * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    minHeight: 140,
    gap: 16,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderWidth: 1,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
});
