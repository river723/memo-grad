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
import { Word, Article, AppSettings } from '../types';
import { getRecommendedWords } from '../utils/examHelpers';

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
  { key: 'science', label: '科学', icon: 'flask' },
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
  const [aiSettings, setAiSettings] = useState<AppSettings | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
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
      setAiSettings(settings);

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
        const recommended = selectRecommendedWords(words, cov, accMap);
        setSelectedWords(recommended);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  // 覆盖度优先级算法 —— 委托给共享工具函数
  const selectRecommendedWords = (
    words: Word[],
    cov: Map<number, number>,
    acc: Map<number, number>
  ): Word[] => {
    return getRecommendedWords(words, cov, acc, articleWordCount);
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
    setGenerateError(null);

    if (selectedWords.length < 5) {
      const msg = `至少需要 5 个生词才能生成文章，当前仅 ${selectedWords.length} 个`;
      console.log('[ArticleGen]', msg);
      setGenerateError(msg);
      Alert.alert('生词不足', msg);
      return;
    }
    const latestSettings = await StorageService.getSettings();
    setAiSettings(latestSettings);
    if (!latestSettings.apiKey || !latestSettings.aiModel) {
      const msg = '请先在设置中配置 AI API';
      console.log('[ArticleGen]', msg);
      setGenerateError(msg);
      Alert.alert('未配置 API', msg);
      return;
    }

    setIsGenerating(true);
    setGeneratedArticle(null);
    try {
      const aiService = AIService.fromSettings(latestSettings);
      const wordStrings = selectedWords.map(w => w.word);
      const result = await aiService.generateFunArticle(
        wordStrings,
        selectedTheme,
        articleLength
      );
      setGeneratedArticle(result);
    } catch (error: any) {
      const msg = error.message || '文章生成失败，请重试';
      setGenerateError(msg);
      Alert.alert('生成失败', msg);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 参数设置 */}
      <Surface style={styles.settingsBar}>
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>每篇生词</Text>
          <View style={styles.countStepper}>
            <Button
              mode="text"
              compact
              onPress={() => {
                const newCount = Math.max(5, articleWordCount - 1);
                if (newCount !== articleWordCount) {
                  setArticleWordCount(newCount);
                  if (selectMode === 'smart') {
                    setSelectedWords(
                      getRecommendedWords(allWords, coverage, wordAccuracy, newCount)
                    );
                  }
                }
              }}
              disabled={articleWordCount <= 5}
              labelStyle={styles.countStepperBtn}
            >
              −
            </Button>
            <Text style={styles.countText}>{articleWordCount} 个</Text>
            <Button
              mode="text"
              compact
              onPress={() => {
                const newCount = Math.min(30, articleWordCount + 1);
                if (newCount !== articleWordCount) {
                  setArticleWordCount(newCount);
                  if (selectMode === 'smart') {
                    setSelectedWords(
                      getRecommendedWords(allWords, coverage, wordAccuracy, newCount)
                    );
                  }
                }
              }}
              disabled={articleWordCount >= 30}
              labelStyle={styles.countStepperBtn}
            >
              +
            </Button>
          </View>
        </View>
        <View style={styles.stepperDivider} />
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>目标词数</Text>
          <View style={styles.countStepper}>
            <Button
              mode="text"
              compact
              onPress={() => {
                const newCount = Math.max(100, articleLength - 50);
                if (newCount !== articleLength) {
                  setArticleLength(newCount);
                }
              }}
              disabled={articleLength <= 100}
              labelStyle={styles.countStepperBtn}
            >
              −
            </Button>
            <Text style={styles.countText}>{articleLength} 词</Text>
            <Button
              mode="text"
              compact
              onPress={() => {
                const newCount = Math.min(1000, articleLength + 50);
                if (newCount !== articleLength) {
                  setArticleLength(newCount);
                }
              }}
              disabled={articleLength >= 1000}
              labelStyle={styles.countStepperBtn}
            >
              +
            </Button>
          </View>
        </View>
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
                const recommended = selectRecommendedWords(allWords, coverage, wordAccuracy);
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
                      closeIcon={({color, size}) => (
                        <Text style={{color, fontSize: size, lineHeight: size}}>✕</Text>
                      )}
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
                  const recommended = selectRecommendedWords(allWords, coverage, wordAccuracy);
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
                showSelectedCheck={false}
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

      {/* 状态提示 */}
      {!generatedArticle && !isGenerating && (
        <View style={styles.statusArea}>
          {selectedWords.length < 5 ? (
            <Text style={styles.statusWarn}>
              ⚠ 已选 {selectedWords.length}/5 个生词（不足，请切换手动模式选词或降低生词数）
            </Text>
          ) : !aiSettings?.apiKey || !aiSettings?.aiModel ? (
            <Text style={styles.statusWarn}>
              ⚠ 未配置 AI API，请前往设置页配置
            </Text>
          ) : null}
          {generateError && (
            <Text style={styles.statusError}>{generateError}</Text>
          )}
        </View>
      )}

      {/* 生成按钮 */}
      {!generatedArticle && (
        <Button
          mode="contained"
          onPress={handleGenerate}
          style={styles.generateButton}
          loading={isGenerating}
          disabled={isGenerating}
          icon="auto-fix"
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    elevation: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  stepperLabel: {
    fontSize: 13,
    color: '#1976D2',
  },
  stepperDivider: {
    height: 1,
    backgroundColor: '#BBDEFB',
    marginVertical: 6,
  },
  countStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  countStepperBtn: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  countText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
    minWidth: 44,
    textAlign: 'center',
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
  statusArea: {
    marginTop: 8,
    alignItems: 'center',
  },
  statusWarn: {
    fontSize: 13,
    color: '#FF9800',
    textAlign: 'center',
    lineHeight: 20,
  },
  statusError: {
    fontSize: 13,
    color: '#F44336',
    textAlign: 'center',
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
