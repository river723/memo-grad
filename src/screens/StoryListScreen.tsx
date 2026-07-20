import React from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Surface, Text, Chip } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import storiesData from '../data/stories.json';
import type { StorySeries } from '../types';

const stories = storiesData as StorySeries;

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
  entryRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingBottom: 4,
  },
  entryCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
    minHeight: 92,
  },
  entryCardActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  entryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  entryDesc: {
    fontSize: 11,
    color: colors.tertiary,
    lineHeight: 16,
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
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 56,
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
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

  const renderChapter = ({ item }: { item: StorySeries['chapters'][number] }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('StoryDetail', { chapterId: item.id })}
      activeOpacity={0.7}
    >
      <Surface style={styles.chapterCard}>
        <View style={styles.chapterRow}>
          <Text style={styles.chapterNum}>
            第{item.id}章
          </Text>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.chapterInfo}>
            <Text style={styles.wordCount}>{item.word_count} 词</Text>
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
        data={stories.chapters}
        renderItem={renderChapter}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <>
            {/* 顶部两个入口：系列故事 / 趣味文章 */}
            <View style={styles.entryRow}>
              <Surface style={[styles.entryCard, styles.entryCardActive]}>
                <View style={styles.entryIconRow}>
                  <MaterialIcons name="auto-stories" size={20} color={colors.primary} />
                  <Text style={styles.entryTitle}>系列故事</Text>
                </View>
                <Text style={styles.entryDesc}>
                  4801 词长篇连载{'\n'}目标词高亮 + 译文
                </Text>
              </Surface>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ArticleList')}
              >
                <Surface style={styles.entryCard}>
                  <View style={styles.entryIconRow}>
                    <MaterialIcons name="article" size={20} color={colors.tertiary} />
                    <Text style={styles.entryTitle}>趣味文章</Text>
                  </View>
                  <Text style={styles.entryDesc}>
                    按需生成短文{'\n'}自选生词与主题
                  </Text>
                </Surface>
              </TouchableOpacity>
            </View>

            <View style={styles.seriesHeader}>
              <Text style={styles.seriesTitle}>{stories.series_title}</Text>
              <Text style={styles.seriesMeta}>
                共 {stories.total_chapters} 章 · {stories.total_words} 个单词
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.tertiary, textAlign: 'center', lineHeight: 22 }}>
              暂无故事章节。{'\n'}请先运行 scripts/generateStories.js 生成故事数据。
            </Text>
          </View>
        }
      />
    </View>
  );
}
