import React, { useState, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text, FAB } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import { makeStyles } from '../utils/useStyles';
import StorageService from '../services/StorageService';
import { Article } from '../types';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import EmptyState from '../components/ds/EmptyState';

const THEME_LABELS: Record<string, string> = {
  technology: '科技',
  life: '生活',
  history: '历史',
  nature: '自然',
  science: '科学',
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
    paddingBottom: 96,
  },
  articleCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  articleTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
    lineHeight: 22,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    fontSize: 11,
    color: colors.tertiary,
  },
  articleContent: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 10,
  },
  articleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  themePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
  },
  themePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  wordChips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  wordChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.secondaryContainer,
  },
  wordChipText: {
    fontSize: 10,
    color: colors.secondary,
  },
  moreWords: {
    fontSize: 11,
    color: colors.tertiary,
  },
  fab: {
    position: 'absolute',
    margin: spacing.lg,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 16,
  },
}));

export default function ArticleListScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [articles, setArticles] = useState<Article[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadArticles();
    }, [])
  );

  const loadArticles = async () => {
    try {
      const allArticles = await StorageService.getArticles();
      allArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setArticles(allArticles);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  const handleDelete = async (article: Article) => {
    const confirmed = await showConfirm(
      '确认删除',
      `确定要删除文章「${article.title}」吗？删除后无法恢复。`,
      { confirmText: '删除', cancelText: '取消' }
    ).catch(() => false);
    if (!confirmed) return;
    if (article.id != null) {
      await StorageService.deleteArticle(article.id);
      loadArticles();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const renderArticle = ({ item }: { item: Article }) => (
    <Pressable
      onPress={() => item.id != null && navigation.navigate('ArticleDetail', { articleId: item.id })}
      style={({ pressed }) => [styles.articleCard, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.articleHeader}>
        <Text style={styles.articleTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Pressable
          onPress={() => handleDelete(item)}
          hitSlop={8}
          style={({ pressed }) => [styles.deleteBtn, { backgroundColor: pressed ? colors.errorContainer : 'transparent' }]}
        >
          <MaterialCommunityIcons name="delete-outline" size={18} color={colors.tertiary} />
        </Pressable>
      </View>

      <View style={styles.articleMeta}>
        <MaterialCommunityIcons name="clock-outline" size={12} color={colors.tertiary} />
        <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
        <Text style={styles.metaText}>· 已读 {item.read_count || 0} 次</Text>
      </View>

      <Text style={styles.articleContent} numberOfLines={2}>
        {item.content}
      </Text>

      <View style={styles.articleFooter}>
        <View style={styles.themePill}>
          <Text style={styles.themePillText}>{THEME_LABELS[item.theme] || item.theme}</Text>
        </View>
        <View style={styles.wordChips}>
          {item.words.slice(0, 4).map((word, index) => (
            <View key={index} style={styles.wordChip}>
              <Text style={styles.wordChipText}>{word}</Text>
            </View>
          ))}
          {item.words.length > 4 && (
            <Text style={styles.moreWords}>+{item.words.length - 4}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  if (articles.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="file-document-outline"
          title="还没有文章"
          description="点击右下角按钮，用你的单词本生成第一篇生动有趣的英文文章。"
          actionLabel="生成文章"
          onAction={() => navigation.navigate('ArticleGenerate')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={articles}
        renderItem={renderArticle}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
      />
      <FAB
        icon="plus"
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => navigation.navigate('ArticleGenerate')}
        label="生成文章"
      />
    </View>
  );
}
