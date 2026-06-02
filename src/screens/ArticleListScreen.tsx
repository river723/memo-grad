import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import {
  Card,
  Text,
  FAB,
  Modal,
  Button as PaperButton,
  Chip,
  Surface,
  IconButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Article } from '../types';

const THEME_LABELS: Record<string, string> = {
  technology: '科技',
  life: '生活',
  history: '历史',
  nature: '自然',
  science: '科学',
  random: '随机',
};

export default function ArticleListScreen() {
  const navigation = useNavigation();
  const [articles, setArticles] = useState<Article[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArticles();
    }, [])
  );

  const loadArticles = async () => {
    try {
      const allArticles = await StorageService.getArticles();
      // 按创建时间倒序
      allArticles.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
      setArticles(allArticles);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  const handleDelete = (article: Article) => {
    setArticleToDelete(article);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (articleToDelete?.id != null) {
      await StorageService.deleteArticle(articleToDelete.id);
      setShowDeleteConfirm(false);
      setArticleToDelete(null);
      loadArticles();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const renderArticle = ({ item }: { item: Article }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ArticleDetail' as never, { articleId: item.id } as never)}
      activeOpacity={0.7}
    >
      <Surface style={styles.articleCard}>
        <View style={styles.articleHeader}>
          <View style={styles.articleTitleArea}>
            <Text style={styles.articleTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.articleMeta}>
              <Text style={styles.articleDate}>{formatDate(item.created_at)}</Text>
              <Text style={styles.articleReadCount}>已读 {item.read_count || 0} 次</Text>
            </View>
          </View>
          <IconButton
            icon="delete-outline"
            size={20}
            iconColor="#999"
            onPress={() => handleDelete(item)}
          />
        </View>
        <View style={styles.articleBody}>
          <Text style={styles.articleContent} numberOfLines={2}>
            {item.content}
          </Text>
        </View>
        <View style={styles.articleFooter}>
          <Chip icon="tag" style={styles.themeChip} textStyle={styles.chipText}>
            {THEME_LABELS[item.theme] || item.theme}
          </Chip>
          <View style={styles.wordChips}>
            {item.words.slice(0, 4).map((word, index) => (
              <Chip key={index} style={styles.wordChip} textStyle={styles.wordChipText} compact>
                {word}
              </Chip>
            ))}
            {item.words.length > 4 && (
              <Text style={styles.moreWords}>+{item.words.length - 4}</Text>
            )}
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="article" size={64} color="#CCC" />
      <Text style={styles.emptyTitle}>还没有文章</Text>
      <Text style={styles.emptyHint}>
        点击下方按钮，用你的单词本生成{'\n'}第一篇生动有趣的英文文章吧！
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={articles}
        renderItem={renderArticle}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={articles.length === 0 ? styles.emptyList : styles.listContent}
        ListEmptyComponent={renderEmpty}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color="#FFF"
        onPress={() => navigation.navigate('ArticleGenerate' as never)}
        label="生成文章"
      />

      {/* 删除确认弹窗 */}
      <Modal
        visible={showDeleteConfirm}
        onDismiss={() => setShowDeleteConfirm(false)}
        contentContainerStyle={styles.modalContent}
      >
        <View style={styles.modalIcon}>
          <Icon name="delete-outline" size={48} color="#F44336" />
        </View>
        <Text style={styles.modalTitle}>确认删除</Text>
        <Text style={styles.modalText}>
          确定要删除文章「{articleToDelete?.title}」吗？{'\n'}删除后无法恢复。
        </Text>
        <View style={styles.modalActions}>
          <PaperButton
            mode="outlined"
            onPress={() => setShowDeleteConfirm(false)}
            style={styles.modalButton}
          >
            取消
          </PaperButton>
          <PaperButton
            mode="contained"
            onPress={confirmDelete}
            style={[styles.modalButton, styles.deleteButton]}
            textColor="#FFF"
          >
            删除
          </PaperButton>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  articleCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: '#FFF',
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  articleTitleArea: {
    flex: 1,
    marginRight: 8,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  articleDate: {
    fontSize: 12,
    color: '#999',
  },
  articleReadCount: {
    fontSize: 12,
    color: '#999',
  },
  articleBody: {
    marginBottom: 10,
  },
  articleContent: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  articleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  themeChip: {
    backgroundColor: '#E3F2FD',
    height: 28,
  },
  chipText: {
    fontSize: 11,
    color: '#1976D2',
  },
  wordChips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  wordChip: {
    backgroundColor: '#FFF3E0',
    height: 26,
  },
  wordChipText: {
    fontSize: 11,
    color: '#E65100',
  },
  moreWords: {
    fontSize: 11,
    color: '#999',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#BBB',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalIcon: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
});
