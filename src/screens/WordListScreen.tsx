import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, FlatList } from 'react-native';
import {
  Card,
  Text,
  TextInput,
  Modal,
  Button as PaperButton,
  Button,
  Chip,
  Surface
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import StorageService from '../services/StorageService';
import { Word, WordCategory } from '../types';
import { WORD_CATEGORIES } from '../constants';

const CATEGORY_NAMES: Record<string, string> = {
  reading: '📖 阅读',
  cloze: '📝 完型',
  translation: '📄 翻译',
  writing: '✍️ 作文'
};

const CATEGORY_COLORS: Record<string, string> = {
  reading: '#E3F2FD',
  cloze: '#FFF3E0',
  translation: '#E8F5E9',
  writing: '#F3E5F5'
};

export default function WordListScreen() {
  const [words, setWords] = useState<Word[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<Word | null>(null);

  useEffect(() => {
    loadWords();
  }, []);

  const loadWords = async () => {
    try {
      const allWords = await StorageService.getWords();
      setWords(allWords);
    } catch (error) {
      console.error('Failed to load words:', error);
    }
  };

  const getFilteredWords = () => {
    let filtered = [...words];

    // 搜索过滤
    if (searchQuery.trim()) {
      filtered = filtered.filter(
        w => w.word.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分类过滤
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(w => w.category === selectedCategory);
    }

    // 按创建时间倒序排列
    return filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  };

  const handleDelete = (word: Word) => {
    setWordToDelete(word);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (wordToDelete) {
      try {
        await StorageService.deleteWord(wordToDelete.id!);
        await loadWords();
        setShowDeleteConfirm(false);
        setWordToDelete(null);
      } catch (error) {
        console.error('Failed to delete word:', error);
      }
    }
  };

  const getDifficultyStars = (difficulty: number) => {
    return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty);
  };

  const renderWordItem = ({ item }: { item: Word }) => (
    <TouchableOpacity
      onPress={() => setEditingWord(item)}
      activeOpacity={0.7}
    >
      <Surface style={styles.wordItem}>
        <View style={styles.wordItemHeader}>
          <Text style={styles.wordText}>{item.word}</Text>
          <View style={styles.wordMeta}>
            <View style={[styles.categoryBadge, {
              backgroundColor: CATEGORY_COLORS[item.category] || '#F5F5F5'
            }]}>
              <Text style={styles.categoryBadgeText}>
                {CATEGORY_NAMES[item.category] || item.category}
              </Text>
            </View>
            <Text style={styles.difficultyText}>
              {getDifficultyStars(item.difficulty)}
            </Text>
          </View>
        </View>

        <Text style={styles.meaning}>
          {item.definitions[0]?.meaning || '暂无释义'}
        </Text>

        {/* 显示核心词或熟词僻义标签 */}
        {(item.definitions[0]?.is_core || item.definitions[0]?.is_rare_sense) && (
          <View style={styles.tags}>
            {item.definitions[0]?.is_core && (
              <Chip mode="flat" compact style={styles.coreTag}>核心</Chip>
            )}
            {item.definitions[0]?.is_rare_sense && (
              <Chip mode="flat" compact style={styles.rareTag}>熟词僻义</Chip>
            )}
          </View>
        )}

        {/* 词根词缀预览 */}
        {item.etymology && (
          <Text style={styles.etymology} numberOfLines={1}>
            🔍 {item.etymology}
          </Text>
        )}

        <View style={styles.wordActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDelete(item)}
          >
            <Icon name="delete-outline" size={20} color="#F44336" />
            <Text style={[styles.actionText, { color: '#F44336' }]}>删除</Text>
          </TouchableOpacity>
          <View style={styles.frequencyBar}>
            <View style={[styles.frequencyFill, {
              width: `${Math.min(item.frequency * 10, 100)}%`,
              backgroundColor: item.frequency >= 7 ? '#4CAF50' :
                              item.frequency >= 4 ? '#FF9800' : '#FF5722'
            }]} />
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 我的生词本</Text>
        <Text style={styles.headerSubtitle}>共 {words.length} 个单词</Text>
      </View>

      {/* 搜索栏 */}
      <Card style={styles.searchCard}>
        <TextInput
          mode="flat"
          placeholder="搜索单词..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          left={<TextInput.Icon icon="magnify" />}
          clearButtonMode="while-editing"
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </Card>

      {/* 分类筛选 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryScrollContent}
      >
        <TouchableOpacity
          style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[
            styles.categoryChipText,
            selectedCategory === 'all' && styles.categoryChipTextActive
          ]}>
            全部
          </Text>
        </TouchableOpacity>
        {Object.entries(CATEGORY_NAMES).map(([key, name]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.categoryChip,
              selectedCategory === key && styles.categoryChipActive
            ]}
            onPress={() => setSelectedCategory(key)}
          >
            <Text style={[
              styles.categoryChipText,
              selectedCategory === key && styles.categoryChipTextActive
            ]}>
              {name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 单词列表 */}
      <FlatList
        data={getFilteredWords()}
        renderItem={renderWordItem}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        style={styles.wordList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="search-off" size={48} color="#CCC" />
            <Text style={styles.emptyText}>
              {searchQuery || selectedCategory !== 'all'
                ? '没有找到匹配的单词'
                : '还没有添加单词'}
            </Text>
            <Text style={styles.emptyHint}>
              {searchQuery || selectedCategory !== 'all'
                ? '试试调整搜索条件'
                : '点击下方按钮添加你的第一个单词吧'}
            </Text>
          </View>
        }
      />

      {/* 添加按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {}}
        activeOpacity={0.8}
      >
        <Icon name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* 删除确认对话框 */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>确认删除</Text>
            <Text style={styles.modalText}>
              确定要删除单词 "{wordToDelete?.word}" 吗？
              删除后将无法恢复。
            </Text>
            <View style={styles.modalButtons}>
              <PaperButton onPress={() => setShowDeleteConfirm(false)}>
                取消
              </PaperButton>
              <PaperButton
                onPress={confirmDelete}
                style={{ color: '#F44336' }}
              >
                删除
              </PaperButton>
            </View>
          </Surface>
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
  header: {
    padding: 20,
    paddingBottom: 16,
    backgroundColor: '#1976D2',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  searchCard: {
    marginHorizontal: 16,
    marginTop: -10,
    elevation: 4,
    borderRadius: 12,
  },
  searchInput: {
    backgroundColor: 'white',
    borderRadius: 12,
  },
  categoryScroll: {
    marginTop: 12,
    marginBottom: 4,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
  },
  categoryChipTextActive: {
    color: 'white',
    fontWeight: '500',
  },
  wordList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  wordItem: {
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
  },
  wordItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  wordText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    flexShrink: 1,
  },
  wordMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  difficultyText: {
    fontSize: 11,
    color: '#FF9800',
    marginTop: 2,
  },
  meaning: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 4,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  coreTag: {
    backgroundColor: '#E3F2FD',
  },
  rareTag: {
    backgroundColor: '#FFF3E0',
  },
  etymology: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  wordActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  frequencyBar: {
    width: 100,
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
  },
  frequencyFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 300,
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#F44336',
  },
  modalText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});