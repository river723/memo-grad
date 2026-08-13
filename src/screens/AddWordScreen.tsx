import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Text,
  Chip,
  ActivityIndicator,
  Surface,
  Dialog,
  Portal,
  SegmentedButtons
} from 'react-native-paper';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette, radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { Word, AIResponse, AppSettings } from '../types';
import { getLocalWordDictResult, mergeAIResultIntoWord } from '../utils/wordUtils';
import DifficultyDots from '../components/DifficultyDots';
import SectionHeader from '../components/ds/SectionHeader';

type AddWordTab = 'wordbank' | 'manual';

type AnalysisSourceBuckets = {
  local: Map<string, AIResponse>;
  ai: Map<string, AIResponse>;
};

export default function AddWordScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<AddWordTab>('wordbank');
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Map<string, AIResponse> | AIResponse | null>(null);
  const [analysisSources, setAnalysisSources] = useState<AnalysisSourceBuckets | null>(null);
  const [pronunciation, setPronunciation] = useState('');
  const [customDefinitions, setCustomDefinitions] = useState('');
  const [parsedWords, setParsedWords] = useState<string[]>([]);
  const [aiSettings, setAiSettings] = useState<AppSettings | null>(null);

  // 覆盖确认 Dialog 状态
  const [overwriteDialog, setOverwriteDialog] = useState<{
    visible: boolean;
    word: string;
    existing: Word | null;
    analysis: AIResponse | null;
  }>({ visible: false, word: '', existing: null, analysis: null });

  // 组件挂载时加载API密钥（仅执行一次）
  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      const settings = await StorageService.getSettings();
      setAiSettings(settings);
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  // 解析输入的单词
  const parseWords = (text: string): string[] => {
    if (!text.trim()) return [];

    const words = text
      .split(/[\s\n,，。；;：:、\-]/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));

    const uniqueWords = [...new Set(words)];
    return uniqueWords;
  };

  // 获取单词数量和预览
  const getWordInfo = () => {
    const words = parseWords(input);
    setParsedWords(words);
    return words;
  };

  // 分析单词
  const analyzeWords = async () => {
    const words = getWordInfo();

    if (words.length === 0) {
      Alert.alert('提示', '请输入有效的单词');
      return;
    }

    if (words.length > 30) {
      Alert.alert('提示', '一次最多只能处理30个单词');
      return;
    }

    setAnalysisResult(null);
    setAnalysisSources(null);
    setIsAnalyzing(true);
    try {
      const resultMap = new Map<string, AIResponse>();
      const localResults = new Map<string, AIResponse>();
      const aiResults = new Map<string, AIResponse>();
      const missingWords: string[] = [];

      words.forEach(word => {
        const localResult = getLocalWordDictResult(word);
        if (localResult) {
          localResults.set(word, localResult);
          resultMap.set(word, localResult);
        } else {
          missingWords.push(word);
        }
      });

      if (missingWords.length > 0) {
        // AI 补齐本地词库没覆盖到的单词（网络版：不需要 apiKey 检查，后端统一管理）
        if (missingWords.length === 1) {
          const result = await AIService.analyzeWord(missingWords[0]);
          aiResults.set(missingWords[0], result);
          resultMap.set(missingWords[0], result);
        } else {
          const aiResultMap = await AIService.analyzeWords(missingWords);
          aiResultMap.forEach((result, word) => {
            aiResults.set(word, result);
            resultMap.set(word, result);
          });
        }
      }

      setAnalysisSources({ local: localResults, ai: aiResults });
      if (words.length === 1) {
        setAnalysisResult(resultMap.get(words[0]) || null);
      } else {
        setAnalysisResult(resultMap);
      }
    } catch (error: any) {
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 单词分析需要会员订阅，是否前往订阅页？');
        return;
      }
      console.error('分析失败:', error);
      console.error('错误详情:', error.message, error.response?.data);

      const localResults = new Map<string, AIResponse>();
      words.forEach(word => {
        const localResult = getLocalWordDictResult(word);
        if (localResult) {
          localResults.set(word, localResult);
        }
      });

      if (localResults.size > 0) {
        setAnalysisSources({ local: localResults, ai: new Map() });
        setAnalysisResult(words.length === 1 ? localResults.get(words[0])! : localResults);
        Alert.alert(
          '部分单词已从本地词库找到',
          `已保留 ${localResults.size} 个本地词库结果，${words.length - localResults.size} 个未命中词 AI 分析失败，保存时会跳过。`
        );
      } else {
        setAnalysisSources(null);
        Alert.alert('错误', 'AI分析失败，请检查网络连接或API密钥');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 判断是否为单个单词结果
  const isSingleWordResult = (): boolean => {
    if (!analysisResult) return false;
    return !(analysisResult instanceof Map) && 'definitions' in analysisResult;
  };

  // 获取难度等级（从分析结果或默认值）
  const getAnalysisDifficulty = (analysis: AIResponse | null | undefined): number => {
    const raw = analysis?.suggestedDifficulty;
    if (typeof raw !== 'number' || Number.isNaN(raw)) return 3;
    return Math.max(1, Math.min(5, Math.round(raw)));
  };

  // 获取难度描述
  const getDifficultyLabel = (difficulty: number): string => {
    return difficulty <= 2 ? '简单' : difficulty <= 3 ? '中等' : difficulty <= 4 ? '困难' : '极难';
  };

  const canSave = (): boolean => {
    if (parsedWords.length === 0) return false;
    return parsedWords.some(word => getAnalysisFor(word));
  };

  // 获取当前 state 中真实可保存的分析结果，避免保存未分析占位内容
  const getAnalysisFor = (word: string): AIResponse | null => {
    if (analysisResult instanceof Map) {
      return analysisResult.get(word) || null;
    }
    if (analysisResult && parsedWords.length === 1 && parsedWords[0] === word) {
      return analysisResult as AIResponse;
    }
    // 仅手动释义路径（单个单词 + 无分析结果）
    if (!analysisResult && parsedWords.length === 1 && parsedWords[0] === word && customDefinitions.trim()) {
      return {
        definitions: [{
          part_of_speech: 'unknown',
          meaning: customDefinitions.trim(),
          example: '',
          is_core: false,
          is_rare_sense: false
        }],
        etymology: '',
        similar_words: [],
        suggestedDifficulty: 3
      };
    }
    return null;
  };

  const getSavableCount = (): number => parsedWords.filter(word => getAnalysisFor(word)).length;

  const getSingleResultTitle = (): string => {
    if (analysisSources?.local.size) return '本地词库命中 (1)';
    if (analysisSources?.ai.size) return 'AI 分析结果 (1)';
    return '分析结果';
  };

  const renderSuggestedDifficulty = (analysis: AIResponse, compact = false) => {
    const difficulty = getAnalysisDifficulty(analysis);

    return (
      <View style={compact ? styles.difficultyInlineCompact : styles.difficultyInline}>
        <Text style={styles.difficultyInlineLabel}>难度</Text>
        <DifficultyDots difficulty={difficulty} style={styles.difficultyDots} />
        <Text style={styles.difficultyText}>{getDifficultyLabel(difficulty)}</Text>
      </View>
    );
  };

  const renderAnalysisSummaryItem = (word: string, analysis: AIResponse) => (
    <Surface key={word} style={styles.batchWordItem}>
      <View style={styles.batchWordHeader}>
        <Text style={styles.batchWordTitle}>{word}</Text>
        {renderSuggestedDifficulty(analysis, true)}
      </View>
      {analysis.definitions && analysis.definitions.length > 0 ? (
        analysis.definitions.slice(0, 2).map((def, index) => (
          <View key={index} style={styles.batchDefinition}>
            <Text style={styles.batchPartOfSpeech}>{def.part_of_speech}</Text>
            <Text style={styles.batchMeaning}>{def.meaning}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.batchNoAnalysis}>暂无分析结果</Text>
      )}
    </Surface>
  );

  // 清空表单 state
  const resetForm = () => {
    setInput('');
    setParsedWords([]);
    setAnalysisResult(null);
    setAnalysisSources(null);
    setPronunciation('');
    setCustomDefinitions('');
  };

  // 覆盖既有单词
  const overwriteExisting = async (existing: Word, analysis: AIResponse) => {
    try {
      const merged = mergeAIResultIntoWord(existing, analysis);
      const updates: Partial<Word> = {
        ...merged,
        similar_words: Array.isArray(merged.similar_words) ? merged.similar_words : [],
        ...(pronunciation
          ? { pronunciation_uk: pronunciation, pronunciation_us: pronunciation }
          : {}),
      };
      await StorageService.updateWord(existing.id, updates);

      const wordText = existing.word;
      resetForm();
      Alert.alert(
        '覆盖成功 ✏️',
        `已用最新内容覆盖单词「${wordText}」`,
        [
          { text: '继续添加' },
          { text: '返回首页', onPress: () => navigation.goBack() }
        ]
      );
    } catch (error: any) {
      console.error('❌ 覆盖异常:', error);
      Alert.alert('错误', `覆盖失败，请重试: ${error.message}`);
    }
  };

  // 保存单词
  const saveWords = async () => {

    if (!canSave() || parsedWords.length === 0) {
      Alert.alert('提示', '请先进行本地词库/AI分析或填写手动释义');
      return;
    }

    // 单个单词：若已存在，弹覆盖确认
    if (parsedWords.length === 1) {
      const word = parsedWords[0];
      const existingWords = await StorageService.getWords();
      const existing = existingWords.find(
        w => (w.word || '').trim().toLowerCase() === word.trim().toLowerCase()
      );
      if (existing) {
        const analysis = getAnalysisFor(word);
        if (!analysis) {
          Alert.alert('提示', '请先进行本地词库/AI分析或填写手动释义');
          return;
        }
        setOverwriteDialog({ visible: true, word, existing, analysis });
        return;
      }
    }

    try {
      let successCount = 0;
      let failCount = 0;
      let duplicateCount = 0;
      let skippedUnanalyzedCount = 0;

      // 先获取所有已有单词
      const existingWords = await StorageService.getWords();
      const existingWordSet = new Set(existingWords.map(w => w.word.toLowerCase()));

      for (const word of parsedWords) {
        // 检查单词是否已存在（批量场景静默跳过）
        if (existingWordSet.has(word.toLowerCase())) {
          duplicateCount++;
          continue;
        }

        try {
          const analysis = getAnalysisFor(word);
          if (!analysis) {
            skippedUnanalyzedCount++;
            continue;
          }
          const difficulty = getAnalysisDifficulty(analysis);

          const wordData: Omit<Word, 'id'> = {
            word: word,
            pronunciation_uk: pronunciation || undefined,
            pronunciation_us: pronunciation || undefined,
            definitions: analysis.definitions || [
              {
                part_of_speech: 'unknown',
                meaning: '待添加释义',
                example: '',
                is_core: false,
                is_rare_sense: false
              }
            ],
            etymology: analysis?.etymology || '',
            similar_words: Array.isArray(analysis?.similar_words) ? analysis!.similar_words : [],
            memory_tip: analysis?.memoryTip || '',
            difficulty,
            frequency:
              typeof analysis?.examFrequency === 'number' ? analysis.examFrequency : 1
          };

          await StorageService.addWord(wordData);
          successCount++;
        } catch (error) {
          console.error(`❌ 保存单词 ${word} 失败:`, error);
          failCount++;
        }
      }

      const message = `成功保存 ${successCount} 个单词${failCount > 0 ? `，失败 ${failCount} 个` : ''}${duplicateCount > 0 ? `，已有 ${duplicateCount} 个` : ''}${skippedUnanalyzedCount > 0 ? `，未分析跳过 ${skippedUnanalyzedCount} 个` : ''}`;

      // 立即清空数据，让用户看到单词数变为0
      resetForm();

      Alert.alert(
        '保存成功 ✅',
        message,
        [
          { text: '继续添加' },
          { text: '返回首页', onPress: () => navigation.goBack() }
        ]
      );
    } catch (error: any) {
      console.error('❌ 保存异常:', error);
      Alert.alert('错误', `保存失败，请重试: ${error.message}`);
    }
  };

  const wordCount = parsedWords.length;
  const savableCount = getSavableCount();

  return (
    <>
    <ScrollView style={styles.container}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>添加生词</Text>
        <Text style={styles.pageSubtitle}>从本地增强词库快速选择，或手工录入并用 AI 补全释义</Text>
      </View>

      {/* 步骤指示器：1 选词 → 2 录入 → 3 确认 */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '700' }}>1</Text>
        </View>
        <Text style={[styles.stepLabel, { color: colors.primary, marginLeft: 6 }]}>选词</Text>
        <View style={[styles.stepLine, { backgroundColor: colors.outline }]} />
        <View
          style={[
            styles.stepDot,
            { backgroundColor: activeTab === 'manual' ? colors.primary : colors.surface, borderWidth: 1.5, borderColor: activeTab === 'manual' ? colors.primary : colors.outline },
          ]}
        >
          <Text style={{ color: activeTab === 'manual' ? colors.onPrimary : colors.tertiary, fontSize: 12, fontWeight: '700' }}>2</Text>
        </View>
        <Text style={[styles.stepLabel, { color: activeTab === 'manual' ? colors.primary : colors.tertiary, marginLeft: 6 }]}>录入</Text>
        <View style={[styles.stepLine, { backgroundColor: colors.outline }]} />
        <View style={[styles.stepDot, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline }]}>
          <Text style={{ color: colors.tertiary, fontSize: 12, fontWeight: '700' }}>3</Text>
        </View>
        <Text style={[styles.stepLabel, { color: colors.tertiary, marginLeft: 6 }]}>确认</Text>
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AddWordTab)}
        buttons={[
          { value: 'wordbank', label: '本地词库', icon: 'book-search' },
          { value: 'manual', label: '手工添加', icon: 'pencil-plus' },
        ]}
        style={styles.tabButtons}
      />

      {activeTab === 'wordbank' && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.pickerEntryRow}>
              <MaterialIcons name="library-books" size={40} color={colors.primary} />
              <View style={styles.pickerEntryText}>
                <Text style={styles.pickerEntryTitle}>从本地词库选词</Text>
                <Text style={styles.pickerEntryHint}>4801 个考研词，已含词根、例句和易混词，勾选即可加入生词本</Text>
              </View>
            </View>
            <Button
              mode="contained"
              icon="book-search"
              onPress={() => navigation.navigate('WordbankPicker')}
              style={styles.pickerEntryButton}
            >
              打开本地词库
            </Button>
          </Card.Content>
        </Card>
      )}

      {activeTab === 'manual' && (
        <Card style={styles.card}>
          <Card.Title title="手工添加新单词" titleStyle={styles.cardTitle} />
          <Card.Content>
          {/* 单词输入 */}
          <Text style={styles.helperText}>输入1-30个单词，用空格、换行或标点符号分隔</Text>
          <TextInput
            label="输入英文单词"
            value={input}
            onChangeText={(text) => {
              setInput(text);
              // 输入变化时同步更新 parsedWords，并清理旧分析结果
              const words = parseWords(text);
              setParsedWords(words);
              setAnalysisResult(null);
              setAnalysisSources(null);
            }}
            mode="outlined"
            multiline
            numberOfLines={5}
            style={styles.input}
            placeholder="例如: abandon persist diligent&#10;或者: abandon,persist,diligent"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* 单词预览 */}
          {wordCount > 0 && (
            <Surface style={styles.previewContainer}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>解析结果</Text>
                <Chip 
                  style={styles.wordCountChip}
                  textStyle={styles.chipText}
                >
                  {wordCount}个单词
                </Chip>
              </View>
              <Text style={styles.previewWords}>
                {parsedWords.join(', ')}
              </Text>
              {wordCount > 30 && (
                <Text style={styles.warningText}>超过30个限制，只会处理前30个</Text>
              )}
            </Surface>
          )}

          {/* 音标输入（仅单个单词时显示） */}
          {wordCount === 1 && (
            <TextInput
              label="音标 (可选)"
              value={pronunciation}
              onChangeText={setPronunciation}
              mode="outlined"
              style={styles.input}
              placeholder="例如: [əˈbændən]"
            />
          )}

          {/* 本地词库/AI分析按钮 */}
          <Button
            mode="contained"
            onPress={analyzeWords}
            loading={isAnalyzing}
            disabled={isAnalyzing || wordCount === 0}
            style={styles.analyzeButton}
            icon="auto-fix"
          >
            {isAnalyzing ? '分析中...' : `本地词库/AI分析 (${wordCount}个)`}
          </Button>
        </Card.Content>
      </Card>

      )}

      {activeTab === 'manual' && isAnalyzing && (
        <Card style={styles.card}>
          <Card.Content style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>正在查找本地词库，必要时调用 AI...</Text>
          </Card.Content>
        </Card>
      )}

      {/* 分析结果 - 单个单词 */}
      {activeTab === 'manual' && analysisResult && isSingleWordResult() && (
        <Card style={styles.card}>
          <Card.Title title={getSingleResultTitle()} titleStyle={styles.cardTitle} />
          <Card.Content>
            {renderSuggestedDifficulty(analysisResult as AIResponse)}

            {/* 释义 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📚 考研释义</Text>
              {(analysisResult as AIResponse).definitions?.map((def, index) => (
                <Surface key={index} style={styles.definitionItem}>
                  <View style={styles.definitionHeader}>
                    <Text style={styles.partOfSpeech}>{def.part_of_speech}</Text>
                    {def.is_core && <Chip mode="flat" compact>核心</Chip>}
                    {def.is_rare_sense && <Chip mode="flat" compact>熟词僻义</Chip>}
                  </View>
                  <Text style={styles.meaning}>{def.meaning}</Text>
                  {def.example && (
                    <Text style={styles.example}>例句: {def.example}</Text>
                  )}
                </Surface>
              ))}
            </View>

            {/* 词根词缀 */}
            {(analysisResult as AIResponse).etymology && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔍 词根词缀</Text>
                <Surface style={styles.etymologyContainer}>
                  <Text style={styles.etymologyText}>{(analysisResult as AIResponse).etymology}</Text>
                </Surface>
              </View>
            )}

            {/* 记忆口诀 */}
            {(analysisResult as AIResponse).memoryTip && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 记忆口诀</Text>
                <Surface style={styles.etymologyContainer}>
                  <Text style={styles.etymologyText}>{(analysisResult as AIResponse).memoryTip}</Text>
                </Surface>
              </View>
            )}

            {/* 形近词 */}
            {Array.isArray((analysisResult as AIResponse).similar_words) && (analysisResult as AIResponse).similar_words!.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚠️ 易混词提醒</Text>
                {(analysisResult as AIResponse).similar_words!.map((similar, index) => (
                  <Surface key={index} style={styles.similarWordItem}>
                    <Text style={styles.similarWord}>
                      {similar.word} ({similar.relation}): {similar.description}
                    </Text>
                  </Surface>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>
      )}

      {/* 分析结果 - 多个单词 */}
      {activeTab === 'manual' && analysisResult && analysisSources && !isSingleWordResult() && (
        <>
          {analysisSources.local.size > 0 && (
            <Card style={styles.card}>
              <Card.Title title={`本地词库命中 (${analysisSources.local.size}个单词)`} titleStyle={styles.cardTitle} />
              <Card.Content>
                {Array.from(analysisSources.local.entries()).map(([word, analysis]) =>
                  renderAnalysisSummaryItem(word, analysis)
                )}
              </Card.Content>
            </Card>
          )}

          {analysisSources.ai.size > 0 && (
            <Card style={styles.card}>
              <Card.Title title={`AI 分析结果 (${analysisSources.ai.size}个单词)`} titleStyle={styles.cardTitle} />
              <Card.Content>
                {Array.from(analysisSources.ai.entries()).map(([word, analysis]) =>
                  renderAnalysisSummaryItem(word, analysis)
                )}
              </Card.Content>
            </Card>
          )}
        </>
      )}

      {/* 手动添加释义（仅单个单词且无分析时显示） */}
      {activeTab === 'manual' && wordCount === 1 && !analysisResult && (
        <Card style={styles.card}>
          <Card.Title title="手动添加释义" titleStyle={styles.cardTitle} />
          <Card.Content>
            <TextInput
              label="单词释义"
              value={customDefinitions}
              onChangeText={setCustomDefinitions}
              mode="outlined"
              multiline
              numberOfLines={3}
              placeholder="请输入单词的中文释义、例句等..."
              style={styles.textArea}
            />
          </Card.Content>
        </Card>
      )}

      {/* 保存按钮 */}
      {activeTab === 'manual' && (
      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={saveWords}
          disabled={!canSave()}
          style={styles.saveButton}
          icon="content-save"
        >
          保存 ({savableCount}/{wordCount}个单词)
        </Button>

        {/* <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        >
          返回
        </Button> */}
      </View>
      )}
    </ScrollView>

    {/* 覆盖确认 Dialog */}
    <Portal>
      <Dialog
        visible={overwriteDialog.visible}
        onDismiss={() => setOverwriteDialog({ visible: false, word: '', existing: null, analysis: null })}
      >
        <Dialog.Title>单词已存在</Dialog.Title>
        <Dialog.Content>
          <Text style={{ lineHeight: 20 }}>
            「{overwriteDialog.word}」已在生词本中，是否用最新内容覆盖？{'\n'}
            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
              覆盖会更新释义、词根、形近词、难度、音标，不影响学习记录。
            </Text>
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={() => setOverwriteDialog({ visible: false, word: '', existing: null, analysis: null })}
          >
            取消
          </Button>
          <Button
            mode="contained"
            buttonColor={palette.danger}
            textColor="#fff"
            onPress={() => {
              const { existing, analysis } = overwriteDialog;
              setOverwriteDialog({ visible: false, word: '', existing: null, analysis: null });
              if (existing && analysis) {
                overwriteExisting(existing, analysis);
              }
            }}
          >
            覆盖
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
    </>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  pageHeader: {
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    fontFamily: 'SourceSerif4, Georgia, serif',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  tabButtons: {
    marginBottom: 16,
  },
  // 新增：步骤指示器
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    height: 1.5,
    marginHorizontal: 6,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  pickerEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerEntryText: {
    flex: 1,
    marginLeft: 12,
  },
  pickerEntryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 2,
  },
  pickerEntryHint: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  pickerEntryButton: {
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  helperText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  input: {
    marginBottom: 16,
  },
  previewContainer: {
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    elevation: 1,
    backgroundColor: colors.primaryContainer,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
  },
  wordCountChip: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.onPrimaryContainer,
    fontSize: 12,
  },
  previewWords: {
    fontSize: 12,
    color: colors.onSurface,
    lineHeight: 18,
  },
  warningText: {
    fontSize: 11,
    color: palette.danger,
    marginTop: 8,
    fontStyle: 'italic',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.primary,
  },
  segmentedButtons: {
    marginBottom: 16,
  },
  analyzeButton: {
    marginTop: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.primary,
  },
  definitionItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  definitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  partOfSpeech: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginRight: 8,
  },
  meaning: {
    fontSize: 14,
    color: colors.onSurface,
  },
  example: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    fontStyle: 'italic',
  },
  etymologyContainer: {
    padding: 12,
    borderRadius: 8,
    elevation: 1,
  },
  etymologyText: {
    fontSize: 14,
    color: colors.onSurface,
  },
  similarWordItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  similarWord: {
    fontSize: 14,
    color: colors.onSurface,
  },
  textArea: {
    marginBottom: 16,
  },
  difficultyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.accentLight,
    marginBottom: 12,
  },
  difficultyInlineCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: palette.accentLight,
  },
  difficultyInlineLabel: {
    fontSize: 12,
    color: palette.accentDark,
    marginRight: 6,
    fontWeight: '600',
  },
  difficultyDots: {
    flexDirection: 'row',
    marginHorizontal: 8,
  },
  difficultyText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    minWidth: 50,
    textAlign: 'right',
  },
  buttonContainer: {
    marginBottom: 32,
  },
  saveButton: {
    marginBottom: 8,
  },
  cancelButton: {},
  batchWordItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  batchWordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  batchWordTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  batchDefinition: {
    marginBottom: 4,
  },
  batchPartOfSpeech: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  batchMeaning: {
    fontSize: 14,
    color: colors.onSurface,
  },
  batchNoAnalysis: {
    fontSize: 14,
    color: colors.tertiary,
    fontStyle: 'italic',
  },
}));