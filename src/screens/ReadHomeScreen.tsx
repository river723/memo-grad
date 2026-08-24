import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import AppIcon, { type IconName } from '../components/ds/AppIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { spring } from '../theme/motion';
import StorageService from '../services/StorageService';
import { getStorySeries, type StorySeriesMeta } from '../utils/storyContent';
import StoryListScreen from './StoryListScreen';
import ArticleListScreen from './ArticleListScreen';

type ReadTabKey = 'story' | 'article';

type ReadStats = {
  storyChapters: number;
  storyWords: number;
  articleCount: number;
  readArticles: number;
  progressPct: number;
};

const EMPTY: ReadStats = { storyChapters: 0, storyWords: 0, articleCount: 0, readArticles: 0, progressPct: 0 };

export default function ReadHomeScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const [active, setActive] = useState<ReadTabKey>('story');
  const [stats, setStats] = useState<ReadStats>(EMPTY);

  // 进场动效
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(12)).current;

  const loadStats = useCallback(async () => {
    try {
      const [series, articles] = await Promise.all([
        getStorySeries(),
        StorageService.getArticles(),
      ]);
      const articleCount = articles.length;
      const readArticles = articles.filter(a => (a.read_count || 0) > 0).length;
      const progressPct = articleCount > 0 ? Math.round((readArticles / articleCount) * 100) : 0;
      setStats({
        storyChapters: series?.totalChapters ?? 0,
        storyWords: series?.totalWords ?? 0,
        articleCount,
        readArticles,
        progressPct,
      });
    } catch (e) {
      console.warn('[ReadHome] 加载阅读统计失败：', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  useEffect(() => {
    heroOpacity.setValue(0);
    heroTranslate.setValue(12);
    Animated.parallel([
      Animated.spring(heroOpacity, { toValue: 1, ...spring, useNativeDriver: true }),
      Animated.spring(heroTranslate, { toValue: 0, ...spring, useNativeDriver: true }),
    ]).start();
  }, [heroOpacity, heroTranslate]);

  const segments: { key: ReadTabKey; label: string; count: number; icon: IconName }[] = [
    { key: 'story', label: '系列故事', count: stats.storyChapters, icon: 'book-open-variant' },
    { key: 'article', label: '趣味文章', count: stats.articleCount, icon: 'file-document-outline' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 固定头部：Hero（双段分别描述两类） + 段切换 */}
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
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
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: typography.caption.size, letterSpacing: 0.6 }}>
            阅读中心
          </Text>
          <View style={styles.heroDivider} />
          {/* 段1：系列故事 */}
          <View style={styles.heroRow}>
            <View style={styles.heroIconSmall}>
              <AppIcon name="book-open-variant" size={18} color={colors.onPrimary} />
            </View>
            <Text style={{ flex: 1, color: colors.onPrimary, fontSize: typography.bodySm.size, fontWeight: '600' }}>
              系列故事
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, fontWeight: '500' }}>
              共 {stats.storyChapters} 章 · {stats.storyWords} 词
            </Text>
          </View>
          {/* 段2：趣味文章 */}
          <View style={styles.heroRow}>
            <View style={styles.heroIconSmall}>
              <AppIcon name="file-document-outline" size={18} color={colors.onPrimary} />
            </View>
            <Text style={{ flex: 1, color: colors.onPrimary, fontSize: typography.bodySm.size, fontWeight: '600' }}>
              趣味文章
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: typography.bodySm.size, fontWeight: '500' }}>
              已读 {stats.readArticles}/{stats.articleCount} · 进度 {stats.progressPct}%
            </Text>
          </View>
        </Animated.View>

        {/* 段切换 */}
        <View style={styles.segmentRow}>
          {segments.map((seg) => {
            const isActive = active === seg.key;
            return (
              <Pressable
                key={seg.key}
                onPress={() => setActive(seg.key)}
                style={({ pressed }) => [
                  styles.segment,
                  {
                    backgroundColor: isActive ? colors.primaryContainer : colors.surface,
                    borderColor: isActive ? colors.primary : colors.outline,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <AppIcon
                  name={seg.icon}
                  size={16}
                  color={isActive ? colors.primary : colors.tertiary}
                />
                <Text
                  style={{
                    fontSize: typography.bodySm.size,
                    fontWeight: '600',
                    color: isActive ? colors.primary : colors.onSurface,
                  }}
                >
                  {seg.label}
                </Text>
                <View
                  style={[
                    styles.segmentCount,
                    { backgroundColor: isActive ? colors.primary : colors.surfaceVariant },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: typography.caption.size,
                      fontWeight: '700',
                      color: isActive ? colors.onPrimary : colors.tertiary,
                    }}
                  >
                    {seg.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 两个列表都挂载，用显隐切换以保留各自滚动位置与状态 */}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, ...(active !== 'story' ? { display: 'none' as any } : {}) }}>
          <StoryListScreen />
        </View>
        <View style={{ flex: 1, ...(active !== 'article' ? { display: 'none' as any } : {}) }}>
          <ArticleListScreen />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'column',
    padding: 18,
    gap: 10,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  segmentCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
