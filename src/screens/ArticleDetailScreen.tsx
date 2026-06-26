import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  Card,
  Text,
  Button,
  Modal,
  Chip,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import StorageService from '../services/StorageService';
import AIService from '../services/AIService';
import { Article, Word, WordDefinition } from '../types';

const THEME_LABELS: Record<string, string> = {
  technology: '科技',
  life: '生活',
  history: '历史',
  nature: '自然',
  science: '科学',
  random: '随机',
};

// 将文章内容按生词拆分为可渲染的段落
interface TextSegment {
  text: string;
  isWord: boolean;
  wordObj?: Word;
}

function parseArticleContent(
  content: string,
  targetWords: string[],
  wordMap: Map<string, Word>
): TextSegment[] {
  if (!content || targetWords.length === 0) {
    return [{ text: content || '', isWord: false }];
  }

  // 构建正则：匹配所有目标单词（单词边界，大小写不敏感）
  const escapedWords = targetWords
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length); // 长词优先匹配
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // 匹配前的普通文本
    if (match.index > lastIndex) {
      segments.push({
        text: content.substring(lastIndex, match.index),
        isWord: false,
      });
    }
    // 匹配的生词
    const matchedWord = match[0];
    const lowerWord = matchedWord.toLowerCase();
    segments.push({
      text: matchedWord,
      isWord: true,
      wordObj: wordMap.get(lowerWord),
    });
    lastIndex = pattern.lastIndex;
  }

  // 剩余文本
  if (lastIndex < content.length) {
    segments.push({
      text: content.substring(lastIndex),
      isWord: false,
    });
  }

  return segments;
}

export default function ArticleDetailScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'ArticleDetail'>();
  const { articleId } = route.params as { articleId: number };

  const [article, setArticle] = useState<Article | null>(null);
  const [wordMap, setWordMap] = useState<Map<string, Word>>(new Map());
  const [segments, setSegments] = useState<TextSegment[]>([]);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [showWordModal, setShowWordModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadArticle();
    }, [articleId])
  );

  const loadArticle = async () => {
    try {
      const art = await StorageService.getArticleById(articleId);
      if (!art) {
        Alert.alert('错误', '文章不存在');
        navigation.goBack();
        return;
      }
      setArticle(art);

      // 加载相关单词的完整信息
      const allWords = await StorageService.getWords();
      const wMap = new Map<string, Word>();
      for (const wordId of art.word_ids) {
        const word = allWords.find(w => w.id === wordId);
        if (word) {
          wMap.set(word.word.toLowerCase(), word);
        }
      }
      setWordMap(wMap);

      // 解析文章内容
      const segs = parseArticleContent(art.content, art.words, wMap);
      setSegments(segs);

      // 加载设置，触发旧数据迁移
      await StorageService.getSettings();

      // 更新已读次数
      await StorageService.updateArticle(articleId, {
        read_count: (art.read_count || 0) + 1,
        last_read_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load article:', error);
    }
  };

  const handleWordTap = (wordObj?: Word) => {
    if (wordObj) {
      setSelectedWord(wordObj);
      setShowWordModal(true);
    }
  };

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这篇文章吗？删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteArticle(articleId);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleRegenerate = async () => {
    if (!article) {
      return;
    }

    const settings = await StorageService.getSettings();
    if (!settings.apiKey || !settings.aiModel) {
      Alert.alert('无法生成', '请先在设置中配置 AI API');
      return;
    }

    setIsRegenerating(true);
    try {
      const aiService = AIService.fromSettings(settings);
      const result = await aiService.generateFunArticle(
        article.words,
        article.theme,
        settings.articleLength || 200
      );

      // 更新当前文章内容
      await StorageService.updateArticle(article.id!, {
        title: result.title,
        content: result.content,
        translation: result.translation,
      });

      // 重新加载
      await loadArticle();
    } catch (error: any) {
      Alert.alert('重新生成失败', error.message || '请重试');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!article) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 文章头部 */}
        <View style={styles.header}>
          <Text style={styles.title}>{article.title}</Text>
          <View style={styles.headerMeta}>
            <Chip icon="tag" style={styles.themeChip} textStyle={styles.themeChipText}>
              {THEME_LABELS[article.theme] || article.theme}
            </Chip>
            <Text style={styles.metaText}>
              已读 {article.read_count || 0} 次
            </Text>
          </View>
          {/* 生词标签 */}
          <View style={styles.wordTags}>
            {article.words.map((word, index) => (
              <Chip
                key={index}
                style={styles.wordTag}
                textStyle={styles.wordTagText}
                compact
              >
                {word}
              </Chip>
            ))}
          </View>
        </View>

        {/* 文章正文 - 带生词高亮 */}
        <Card style={styles.contentCard}>
          <Card.Content>
            {isRegenerating ? (
              <View style={styles.regeneratingArea}>
                <ActivityIndicator size="large" color="#1976D2" />
                <Text style={styles.regeneratingText}>正在重新生成文章...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.articleText}>
                  {segments.map((seg, index) => {
                    if (seg.isWord) {
                      return (
                        <Text
                          key={index}
                          style={styles.highlightedWord}
                          onPress={() => handleWordTap(seg.wordObj)}
                        >
                          {seg.text}
                        </Text>
                      );
                    }
                    return <Text key={index}>{seg.text}</Text>;
                  })}
                </Text>
                {article.translation ? (
                  <View style={styles.translationToggleArea}>
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => setShowTranslation(!showTranslation)}
                      icon={showTranslation ? 'eye-off' : 'eye'}
                      labelStyle={styles.translationToggleLabel}
                      style={styles.translationToggleBtn}
                    >
                      {showTranslation ? '隐藏译文' : '显示译文'}
                    </Button>
                  </View>
                ) : null}
                {article.translation && showTranslation && (
                  <View>
                    <View style={styles.translationDivider} />
                    <Text style={styles.translationLabel}>中文翻译</Text>
                    <Text style={styles.translationContent}>
                      {article.translation}
                    </Text>
                  </View>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* 底部提示 */}
        <Text style={styles.tapHint}>
          💡 点击文中<Text style={{ color: '#1976D2', fontWeight: '600' }}>蓝色高亮</Text>生词可查看释义
        </Text>
      </ScrollView>

      {/* 底部操作栏 */}
      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={handleRegenerate}
          loading={isRegenerating}
          disabled={isRegenerating}
          icon="refresh"
          style={styles.bottomButton}
        >
          重新生成
        </Button>
        <Button
          mode="outlined"
          onPress={handleDelete}
          icon="delete-outline"
          style={styles.bottomButton}
          textColor="#F44336"
        >
          删除
        </Button>
      </View>

      {/* 单词释义弹窗 */}
      <Modal
        visible={showWordModal}
        onDismiss={() => setShowWordModal(false)}
        contentContainerStyle={styles.wordModal}
      >
        {selectedWord && (
          <View>
            <View style={styles.wordModalHeader}>
              <Text style={styles.wordModalTitle}>{selectedWord.word}</Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setShowWordModal(false)}
              />
            </View>

            {selectedWord.pronunciation_uk && (
              <Text style={styles.pronunciation}>
                英 /{selectedWord.pronunciation_uk}/
                {selectedWord.pronunciation_us &&
                  `  美 /${selectedWord.pronunciation_us}/`}
              </Text>
            )}

            {/* 释义列表 */}
            <View style={styles.definitions}>
              {selectedWord.definitions.map((def, index) => (
                <View key={index} style={styles.defItem}>
                  <View style={styles.defHeader}>
                    <Chip style={styles.posChip} textStyle={styles.posChipText} compact>
                      {def.part_of_speech}
                    </Chip>
                    <Text style={styles.defMeaning}>{def.meaning}</Text>
                    {def.is_core && (
                      <Chip
                        style={styles.coreChip}
                        textStyle={styles.coreChipText}
                        compact
                      >
                        核心
                      </Chip>
                    )}
                    {def.is_rare_sense && (
                      <Chip
                        style={styles.rareChip}
                        textStyle={styles.rareChipText}
                        compact
                      >
                        熟词僻义
                      </Chip>
                    )}
                  </View>
                  {def.example ? (
                    <Text style={styles.defExample}>{def.example}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* 词根词缀 */}
            {selectedWord.etymology ? (
              <View style={styles.etymologySection}>
                <Text style={styles.sectionLabel}>词根词缀</Text>
                <Text style={styles.etymologyText}>{selectedWord.etymology}</Text>
              </View>
            ) : null}

            {/* 相似词 */}
            {Array.isArray(selectedWord.similar_words) && selectedWord.similar_words.length > 0 && (
              <View style={styles.similarSection}>
                <Text style={styles.sectionLabel}>易混词提醒</Text>
                {selectedWord.similar_words.map((sw, index) => (
                  <Text key={index} style={styles.similarText}>
                    · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  themeChip: {
    backgroundColor: '#E3F2FD',
    height: 28,
  },
  themeChipText: {
    fontSize: 11,
    color: '#1976D2',
  },
  metaText: {
    fontSize: 12,
    color: '#999',
  },
  wordTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordTag: {
    backgroundColor: '#FFF3E0',
    height: 26,
  },
  wordTagText: {
    fontSize: 11,
    color: '#E65100',
  },
  contentCard: {
    borderRadius: 12,
    elevation: 2,
    marginBottom: 12,
  },
  articleText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 28,
  },
  highlightedWord: {
    color: '#1565C0',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: '#1565C0',
    textDecorationStyle: 'solid',
  },
  regeneratingArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  regeneratingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  tapHint: {
    fontSize: 12,
    color: '#BBB',
    textAlign: 'center',
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  bottomButton: {
    flex: 1,
  },
  wordModal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 24,
    borderRadius: 16,
    maxHeight: '70%',
  },
  wordModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wordModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1976D2',
  },
  pronunciation: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  definitions: {
    marginBottom: 12,
  },
  defItem: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  defHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  posChip: {
    backgroundColor: '#F5F5F5',
    height: 22,
  },
  posChipText: {
    fontSize: 10,
    color: '#666',
  },
  defMeaning: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  coreChip: {
    backgroundColor: '#E3F2FD',
    height: 22,
  },
  coreChipText: {
    fontSize: 10,
    color: '#1976D2',
  },
  rareChip: {
    backgroundColor: '#FFF3E0',
    height: 22,
  },
  rareChipText: {
    fontSize: 10,
    color: '#E65100',
  },
  defExample: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: 4,
    lineHeight: 19,
  },
  etymologySection: {
    marginBottom: 12,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  etymologyText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  similarSection: {
    marginBottom: 4,
  },
  similarText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 2,
  },
  translationToggleArea: {
    alignItems: 'center',
    marginTop: 16,
  },
  translationToggleBtn: {
    borderColor: '#1976D2',
  },
  translationToggleLabel: {
    fontSize: 12,
    color: '#1976D2',
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
