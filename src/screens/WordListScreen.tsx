import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import {
  Card,
  Text,
  TextInput,
  Modal,
  Button as PaperButton,
  Chip,
  Surface
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import { Word } from '../types';

export default function WordListScreen() {
  const navigation = useAppNavigation();
  const [words, setWords] = useState<Word[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<Word | null>(null);

  const loadWords = useCallback(async () => {
    try {
      const allWords = await StorageService.getWords();
      setWords(allWords);
    } catch (error) {
      console.error('Failed to load words:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredWords = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    const filtered = query
      ? words.filter(w => w.word.toLowerCase().includes(query))
      : [...words];

    // 按创建时间倒序排列
    return filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }, [words, debouncedSearchQuery]);

  const handleDelete = useCallback((word: Word) => {
    setWordToDelete(word);
    setShowDeleteConfirm(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    setWordToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const id = wordToDelete?.id;
    if (id == null) return;

    try {
      await StorageService.deleteWord(id);
      setWords(prev => prev.filter(word => word.id !== id));
      setShowDeleteConfirm(false);
      setWordToDelete(null);
    } catch (error) {
      console.error('Failed to delete word:', error);
    }
  }, [wordToDelete]);

  const getDifficultyStars = useCallback((difficulty: number) => {
    return '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty);
  }, []);

  const keyExtractor = useCallback((item: Word, index: number) => {
    return String(item.id ?? `${item.word}-${item.created_at ?? index}`);
  }, []);

  const renderWordItem = useCallback(({ item }: { item: Word }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.id != null) navigation.navigate('WordDetail', { wordId: item.id });
      }}
      activeOpacity={0.7}
    >
      <Surface style={styles.wordItem}>
        <View style={styles.wordItemHeader}>
          <Text style={styles.wordText}>{item.word}</Text>
          <Text style={styles.difficultyText}>
            {getDifficultyStars(item.difficulty)}
          </Text>
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
            <MaterialIcons name="delete-outline" size={20} color="#F44336" />
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
  ), [navigation, handleDelete, getDifficultyStars]);

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

      {/* 单词列表 */}
      <FlatList
        data={filteredWords}
        renderItem={renderWordItem}
        keyExtractor={keyExtractor}
        style={styles.wordList}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="search-off" size={48} color="#CCC" />
            <Text style={styles.emptyText}>
              {debouncedSearchQuery
                ? '没有找到匹配的单词'
                : '还没有添加单词'}
            </Text>
            <Text style={styles.emptyHint}>
              {debouncedSearchQuery
                ? '试试调整搜索条件'
                : '点击下方按钮添加你的第一个单词吧'}
            </Text>
          </View>
        }
      />

      {/* 添加按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddWord')}
        activeOpacity={0.8}
      >
        <MaterialIcons name="add" size={28} color="white" />
      </TouchableOpacity>

      {/* 删除确认对话框 */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>确认删除</Text>
            <Text style={styles.modalText}>
              确定要删除单词 "{wordToDelete?.word}" 吗？
              删除后将无法恢复。
            </Text>
            <View style={styles.modalButtons}>
              <PaperButton onPress={cancelDelete}>
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