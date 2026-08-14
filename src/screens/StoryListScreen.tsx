import React, { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Surface, Text, Chip } from 'react-native-paper';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { fontFamily } from '../theme/tokens';
import { makeStyles } from '../utils/useStyles';
import { getStorySeries, type StorySeriesMeta } from '../utils/storyContent';

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
  seriesHeader: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  seriesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 4,
  },
  seriesMeta: {
    fontSize: 12,
    color: colors.tertiary,
    lineHeight: 18,
  },
  chapterCard: {
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: colors.surface,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  chapterNum: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fontFamily.serif,
    color: colors.primary,
    letterSpacing: 0.3,
    minWidth: 56,
  },
  chapterTitle: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: fontFamily.serif,
    color: colors.onSurface,
    letterSpacing: 0.2,
    flex: 1,
  },
  chapterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordCount: {
    fontSize: 12,
    color: colors.tertiary,
  },
  themeChip: {
    height: 22,
  },
}));

export default function StoryListScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();

  const [series, setSeries] = useState<StorySeriesMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getStorySeries();
        if (!cancelled) setSeries(s);
      } catch (err) {
        console.warn('[StoryList] 拉取故事系列失败：', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chapters = series?.chapters ?? [];

  const renderChapter = ({ item }: { item: StorySeriesMeta['chapters'][number] }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('StoryDetail', { chapterId: item.chapterId })}
      activeOpacity={0.7}
    >
      <Surface style={styles.chapterCard}>
        <View style={styles.chapterRow}>
          <Text style={styles.chapterNum}>
            第{item.chapterId}章
          </Text>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.chapterInfo}>
            <Text style={styles.wordCount}>{item.wordCount} 词</Text>
            {item.theme ? (
              <Chip
                icon="tag"
                style={[styles.themeChip, { backgroundColor: colors.primaryContainer }]}
                textStyle={{ fontSize: 10, color: colors.primary }}
              >
                {THEME_LABELS[item.theme] || item.theme}
              </Chip>
            ) : null}
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={chapters}
        renderItem={renderChapter}
        keyExtractor={(item) => String(item.chapterId)}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <View style={styles.seriesHeader}>
            <Text style={styles.seriesTitle}>{series?.seriesTitle ?? '故事系列'}</Text>
            <Text style={styles.seriesMeta}>
              共 {series?.totalChapters ?? '?'} 章 · {series?.totalWords ?? '?'} 个单词
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.tertiary, textAlign: 'center', lineHeight: 22 }}>
              {series ? '暂无故事章节。' : '故事加载中…'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
