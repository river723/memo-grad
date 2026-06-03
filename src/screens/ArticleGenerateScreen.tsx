import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  Chip,
  ActivityIndicator,
  Surface,
  Searchbar,
  SegmentedButtons,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import AIService from '../services/AIService';
import { Word, Article } from '../types';

// 将文章内容中的目标单词高亮
interface PreviewSegment {
  text: string;
  isWord: boolean;
}

function parsePreviewContent(content: string, targetWords: string[]): PreviewSegment[] {
  if (!content || targetWords.length === 0) {
    return [{ text: content || '', isWord: false }];
  }

  const escapedWords = targetWords
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

  const segments: PreviewSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.substring(lastIndex, match.index), isWord: false });
    }
    segments.push({ text: match[0], isWord: true });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.substring(lastIndex), isWord: false });
  }

  return segments;
}

const THEMES = [
  { key: 'random', label: '随机', icon: 'shuffle' },
  { key: 'technology', label: '科技', icon: 'devices' },
  { key: 'life', label: '生活', icon: 'home' },
  { key: 'history', label: '历史', icon: 'history' },
  { key: 'nature', label: '自然', icon: 'nature' },
  { key: 'science', label: '科学', icon: 'science' },
];

export default function ArticleGenerateScreen() {
  const navigation = useNavigation();
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [selectedWords, setSelectedWords] = useState<Word[]>([]);
  const [coverage, setCoverage] = useState<Map<number, number>>(new Map());
  const [wordAccuracy, setWordAccuracy] = useState<Map<number, number>>(new Map());
  const [selectMode, setSelectMode] = useState<'smart' | 'manual'>('smart');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('random');
  const [articleWordCount, setArticleWordCount] = useState(10);
  const [articleLength, setArticleLength] = useState(200);
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<{
    title: string;
    content: string;
    translation: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // 加载设置
      const settings = await StorageService.getSettings();
      setArticleWordCount(settings.articleWordCount || 10);
      setArticleLength(settings.articleLength || 200);
      setApiKey(settings.apiKey || '');

      // 加载单词
      const words = await StorageService.getWords();
      setAllWords(words);

      // 加载覆盖度
      const cov = await StorageService.getWordArticleCoverage();
      setCoverage(cov);

      // 计算每个单词的正确率
      const records = await StorageService.getStudyRecords();
      const accMap = new Map<number, number>();
      for (const word of words) {
        const wordRecords = records.filter(r => r.word_id === word.id);
        if (wordRecords.length === 0) {
          accMap.set(word.id!, 1); // 无记录，默认正确（新词）
        } else {
          const correctCount = wordRecords.filter(r => r.result === 1).length;
          accMap.set(word.id!, correctCount / wordRecords.length);
        }
      }
      setWordAccuracy(accMap);

      // 智能推荐模式：自动选取单词
      if (selectMode === 'smart') {
        const recommended = getRecommendedWords(words, cov, accMap);
        setSelectedWords(recommended);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  // 覆盖度优先级算法
  const getRecommendedWords = (
    words: Word[],
    cov: Map<number, number>,
    acc: Map<number, number>
  ): Word[] => {
    const wordCount = words.filter(w => w.id != null).length;
    if (wordCount === 0) return [];

    // 分类排序
    const p1: Word[] = []; // 未覆盖 + 正确率 < 80%
    const p2: Word[] = []; // 未覆盖 + 正确率 ≥ 80%
    const p3: Word[] = []; // 覆盖 1 次 + 正确率 < 80%
    const p4: Word[] = []; // 覆盖 1 次 + 正确率 ≥ 80%
    const rest: Word[] = []; // 其余（覆盖 ≥ 2 但 < 3）

    for (const word of words) {
      if (word.id == null) continue;
      const count = cov.get(word.id) || 0;
      const accuracy = acc.get(word.id) || 1;

      if (count >= 3) continue; // 排除已覆盖 ≥ 3 次

      if (count === 0) {
        if (accuracy < 0.8) p1.push(word);
        else p2.push(word);
      } else if (count === 1) {
        if (accuracy < 0.8) p3.push(word);
        else p4.push(word);
      } else {
        // count === 2
        rest.push(word);
      }
    }

    // 打乱每个优先级内部顺序（避免每次推荐完全相同）
    const shuffle = (arr: Word[]) => arr.sort(() => Math.random() - 0.5);
    const pool = [...shuffle(p1), ...shuffle(p2), ...shuffle(p3), ...shuffle(p4), ...shuffle(rest)];

    return pool.slice(0, articleWordCount);
  };

  const getCoverageLabel = (wordId: number): string => {
    const count = coverage.get(wordId) || 0;
    if (count === 0) return '首次';
    if (count === 1) return '第2次';
    return `第${count + 1}次`;
  };

  const getCoverageColor = (wordId: number): string => {
    const count = coverage.get(wordId) || 0;
    if (count === 0) return '#4CAF50';
    if (count === 1) return '#FF9800';
    return '#9E9E9E';
  };

  const toggleWordSelection = (word: Word) => {
    setSelectedWords(prev => {
      const exists = prev.find(w => w.id === word.id);
      if (exists) {
        return prev.filter(w => w.id !== word.id);
      } else if (prev.length < articleWordCount) {
        return [...prev, word];
      }
      return prev;
    });
  };

  const replaceWord = (removeWord: Word) => {
    // 从候补池中找下一个词
    const selectedIds = new Set(selectedWords.map(w => w.id));
    const candidate = allWords.find(
      w => w.id !== removeWord.id && !selectedIds.has(w.id)
    );
    if (candidate) {
      setSelectedWords(prev =>
        prev.map(w => (w.id === removeWord.id ? candidate : w))
      );
    } else {
      // 没有候补，直接移除
      setSelectedWords(prev => prev.filter(w => w.id !== removeWord.id));
    }
  };

  const handleGenerate = async () => {
    if (selectedWords.length < 5) {
      Alert.alert('生词不足', '至少需要 5 个生词才能生成文章');
      return;
    }
    if (!apiKey) {
      Alert.alert('未配置 API', '请在设置中配置 DeepSeek API 密钥');
      return;
    }

    setIsGenerating(true);
    setGeneratedArticle(null);
    try {
      const aiService = new AIService(apiKey);
      const wordStrings = selectedWords.map(w => w.word);
      const result = await aiService.generateFunArticle(
        wordStrings,
        selectedTheme,
        articleLength
      );
      setGeneratedArticle(result);
    } catch (error: any) {
      Alert.alert('生成失败', error.message || '文章生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedArticle) return;
    setIsSaving(true);
    try {
      const articleData: Omit<Article, 'id'> = {
        title: generatedArticle.title,
        content: generatedArticle.content,
        translation: generatedArticle.translation,
        words: selectedWords.map(w => w.word),
        word_ids: selectedWords.map(w => w.id!).filter(id => id != null),
        theme: selectedTheme,
        created_at: new Date().toISOString(),
        read_count: 0,
      };
      await StorageService.saveArticle(articleData);
      navigation.navigate('ArticleList' as never);
    } catch (error) {
      Alert.alert('保存失败', '请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWords = allWords.filter(w =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canGenerate = selectedWords.length >= 5;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 设置提示 */}
      <Surface style={styles.settingsBar}>
        <Text style={styles.settingsText}>
          每篇 {articleWordCount} 个生词 · 目标 {articleLength} 词
        </Text>
        <Button
          mode="text"
          compact
          onPress={() => navigation.navigate('Settings' as never)}
          labelStyle={styles.settingsLink}
        >
          调整
        </Button>
      </Surface>

      {/* 选词模式切换 */}
      <Card style={styles.card}>
        <Card.Title title="选择生词" titleStyle={styles.cardTitle} />
        <Card.Content>
          <SegmentedButtons
            value={selectMode}
            onValueChange={(val) => {
              setSelectMode(val as 'smart' | 'manual');
              if (val === 'smart') {
                const recommended = getRecommendedWords(allWords, coverage, wordAccuracy);
                setSelectedWords(recommended);
              }
            }}
            buttons={[
              { value: 'smart', label: '智能推荐' },
              { value: 'manual', label: '手动选择' },
            ]}
            style={styles.segmentButtons}
          />

          {/* 智能推荐模式 */}
          {selectMode === 'smart' && (
            <View style={styles.selectedArea}>
              <Text style={styles.sectionLabel}>
                已选 {selectedWords.length}/{articleWordCount} 个
              </Text>
              {selectedWords.length === 0 && allWords.length > 0 && (
                <Text style={styles.noWordsHint}>
                  单词本中的词都已覆盖 ≥3 次，可切换手动选择
                </Text>
              )}
              <View style={styles.wordGrid}>
                {selectedWords.map(word => (
                  <View key={word.id} style={styles.wordItem}>
                    <Chip
                      style={styles.selectedWordChip}
                      textStyle={styles.wordChipText}
                      onClose={() => replaceWord(word)}
                    >
                      {word.word}
                    </Chip>
                    <Text
                      style={[
                        styles.coverageBadge,
                        { color: getCoverageColor(word.id!) },
                      ]}
                    >
                      {getCoverageLabel(word.id!)}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                mode="text"
                onPress={() => {
                  const recommended = getRecommendedWords(allWords, coverage, wordAccuracy);
                  setSelectedWords(recommended);
                }}
                icon="refresh"
              >
                重新推荐
              </Button>
            </View>
          )}

          {/* 手动选择模式 */}
          {selectMode === 'manual' && (
            <View style={styles.manualArea}>
              <Text style={styles.sectionLabel}>
                已选 {selectedWords.length}/{articleWordCount} 个（至少 5 个）
              </Text>
              <Searchbar
                placeholder="搜索单词..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchBar}
                inputStyle={styles.searchInput}
              />
              <View style={styles.wordGrid}>
                {filteredWords.map(word => {
                  const isSelected = selectedWords.some(w => w.id === word.id);
                  return (
                    <TouchableOpacity
                      key={word.id}
                      onPress={() => toggleWordSelection(word)}
                    >
                      <View style={styles.manualWordItem}>
                        <Chip
                          selected={isSelected}
                          style={[
                            styles.manualWordChip,
                            isSelected && styles.manualWordChipSelected,
                          ]}
                          textStyle={[
                            styles.wordChipText,
                            isSelected && styles.wordChipTextSelected,
                          ]}
                        >
                          {word.word}
                        </Chip>
                        <Text
                          style={[
                            styles.coverageBadge,
                            { color: getCoverageColor(word.id!) },
                          ]}
                        >
                          {getCoverageLabel(word.id!)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* 主题选择 */}
      <Card style={styles.card}>
        <Card.Title title="文章主题" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.themeGrid}>
            {THEMES.map(theme => (
              <Chip
                key={theme.key}
                selected={selectedTheme === theme.key}
                onPress={() => setSelectedTheme(theme.key)}
                style={[
                  styles.themeChip,
                  selectedTheme === theme.key && styles.themeChipSelected,
                ]}
                showSelectedOverlay
                icon={theme.icon}
              >
                {theme.label}
              </Chip>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* 生成按钮 */}
      {!generatedArticle && (
        <Button
          mode="contained"
          onPress={handleGenerate}
          style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
          loading={isGenerating}
          disabled={!canGenerate || isGenerating}
          icon="auto-awesome"
        >
          {isGenerating ? '正在生成...' : '生成文章'}
        </Button>
      )}

      {/* 加载状态 */}
      {isGenerating && (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>AI 正在为你创作文章...</Text>
          <Text style={styles.loadingHint}>这可能需要 10-30 秒</Text>
        </View>
      )}

      {/* 生成结果预览 */}
      {generatedArticle && !isGenerating && (
        <Card style={styles.previewCard}>
          <Card.Title
            title={generatedArticle.title}
            titleStyle={styles.previewTitle}
          />
          <Card.Content>
            <ScrollView style={styles.previewScroll} nestedScrollEnabled>
              <Text style={styles.previewContent}>
                {parsePreviewContent(
                  generatedArticle.content,
                  selectedWords.map(w => w.word)
                ).map((seg, index) => {
                  if (seg.isWord) {
                    return (
                      <Text key={index} style={styles.previewHighlightedWord}>
                        {seg.text}
                      </Text>
                    );
                  }
                  return <Text key={index}>{seg.text}</Text>;
                })}
              </Text>
              {generatedArticle.translation ? (
                <>
                  <View style={styles.translationDivider} />
                  <Text style={styles.translationLabel}>中文翻译</Text>
                  <Text style={styles.translationContent}>
                    {generatedArticle.translation}
                  </Text>
                </>
              ) : null}
            </ScrollView>
          </Card.Content>
          <Card.Actions style={styles.previewActions}>
            <Button
              mode="outlined"
              onPress={handleGenerate}
              icon="refresh"
            >
              重新生成
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              icon="content-save"
            >
              保存文章
            </Button>
          </Card.Actions>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  settingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    elevation: 1,
  },
  settingsText: {
    fontSize: 13,
    color: '#1976D2',
  },
  settingsLink: {
    fontSize: 12,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  segmentButtons: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  selectedArea: {
    marginTop: 4,
  },
  manualArea: {
    marginTop: 4,
  },
  searchBar: {
    marginBottom: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    elevation: 0,
    height: 40,
  },
  searchInput: {
    fontSize: 13,
    minHeight: 0,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  selectedWordChip: {
    backgroundColor: '#E3F2FD',
  },
  wordChipText: {
    fontSize: 12,
  },
  wordChipTextSelected: {
    color: '#FFF',
  },
  coverageBadge: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 2,
  },
  noWordsHint: {
    fontSize: 13,
    color: '#FF9800',
    marginBottom: 10,
  },
  manualWordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  manualWordChip: {
    backgroundColor: '#F5F5F5',
  },
  manualWordChipSelected: {
    backgroundColor: '#1976D2',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    backgroundColor: '#F5F5F5',
  },
  themeChipSelected: {
    backgroundColor: '#1976D2',
  },
  generateButton: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 12,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  loadingArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
    marginTop: 16,
  },
  loadingHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  previewCard: {
    marginTop: 12,
    borderRadius: 12,
    elevation: 3,
    maxHeight: 500,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  previewScroll: {
    maxHeight: 280,
  },
  previewContent: {
    fontSize: 15,
    color: '#444',
    lineHeight: 24,
    fontFamily: undefined,
  },
  previewHighlightedWord: {
    color: '#1565C0',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: '#1565C0',
    textDecorationStyle: 'solid',
  },
  previewActions: {
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
  },
  translationDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 16,
  },
  translationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  translationContent: {
    fontSize: 15,
    color: '#555',
    lineHeight: 26,
  },
});
