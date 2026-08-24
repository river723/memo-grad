import React, { useEffect, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { fontFamily, radius, spacing } from '../theme/tokens';
import { makeStyles } from '../utils/useStyles';
import { getStorySeries, type StorySeriesMeta } from '../utils/storyContent';
import EmptyState from '../components/ds/EmptyState';

const THEME_LABELS: Record<string, string> = {
  adventure: '冒险',
  mystery: '悬疑',
  fantasy: '奇幻',
  sciFi: '科幻',
  romance: '浪漫',
  history: '历史',
  nature: '自然',
  random: '随机',
};

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  chapterCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chapterNumBadge: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryContainer,
  },
  chapterNum: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fontFamily.serif,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  chapterTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamily.serif,
    color: colors.onSurface,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  chapterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingLeft: 52,
  },
  metaText: {
    fontSize: 12,
    color: colors.tertiary,
  },
  themePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceVariant,
  },
  themePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
}));

export default function StoryListScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();

  const [series, setSeries] = useState<StorySeriesMeta | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getStorySeries();
        if (!cancelled) setSeries(s);
      } catch (err) {
        console.warn('[StoryList] 拉取故事系列失败：', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chapters = series?.chapters ?? [];

  const renderChapter = ({ item }: { item: StorySeriesMeta['chapters'][number] }) => (
    <Pressable
      onPress={() => navigation.navigate('StoryDetail', { chapterId: item.chapterId })}
      style={({ pressed }) => [
        styles.chapterCard,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.chapterRow}>
        <View style={styles.chapterNumBadge}>
          <Text style={styles.chapterNum}>第{item.chapterId}章</Text>
        </View>
        <Text style={styles.chapterTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tertiary} />
      </View>
      <View style={styles.chapterMeta}>
        <MaterialCommunityIcons name="text" size={13} color={colors.tertiary} />
        <Text style={styles.metaText}>{item.wordCount} 词</Text>
        {item.theme ? (
          <View style={styles.themePill}>
            <Text style={styles.themePillText}>{THEME_LABELS[item.theme] || item.theme}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  if (loaded && chapters.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="book-open-variant"
          title="暂无故事章节"
          description="系列故事尚未发布，请稍后再来。"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chapters}
        renderItem={renderChapter}
        keyExtractor={(item) => String(item.chapterId)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={{ paddingVertical: spacing['2xl'], alignItems: 'center' }}>
            <Text style={{ color: colors.tertiary }}>故事加载中…</Text>
          </View>
        }
      />
    </View>
  );
}
