import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
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
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import AIService from '../services/AIService';
import { Word, AIResponse, AppSettings } from '../types';
import { mergeAIResultIntoWord } from '../utils/wordUtils';

type AddWordTab = 'wordbank' | 'manual';

export default function AddWordScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<AddWordTab>('wordbank');
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Map<string, AIResponse> | AIResponse | null>(null);
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
      console.log('开始加载 AI API 设置...');
      const settings = await StorageService.getSettings();
      console.log('获取到的设置:', settings);
      setAiSettings(settings);

      // 测试API密钥有效性
      if (settings.apiKey && settings.aiModel) {
        console.log('开始测试API密钥...');
        const testResult = await testApiKeyValidity(settings);
        console.log('API密钥测试结果:', testResult);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const testApiKeyValidity = async (settings: AppSettings): Promise<boolean> => {
    try {
      const aiService = AIService.fromSettings(settings);
      console.log('开始测试API密钥有效性...');

      // 测试网络连接
      const networkOk = await aiService.testNetworkConnection();
      if (!networkOk) {
        console.error('网络连接测试失败');
        return false;
      }

      // 测试API密钥
      const apiKeyOk = await aiService.testApiKey();
      if (apiKeyOk) {
        console.log('API密钥验证成功');
        return true;
      } else {
        console.error('API密钥验证失败');
        return false;
      }
    } catch (error) {
      console.error('API密钥测试错误:', error);
      return false;
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
    console.log('解析到的单词:', words);

    if (words.length === 0) {
      Alert.alert('提示', '请输入有效的单词');
      return;
    }

    if (words.length > 30) {
      Alert.alert('提示', '一次最多只能处理30个单词');
      return;
    }

    setIsAnalyzing(true);
    try {
      const latestSettings = await StorageService.getSettings();
      setAiSettings(latestSettings);
      if (!latestSettings.apiKey || !latestSettings.aiModel) {
        Alert.alert('错误', '请先在设置中配置 AI API');
        return;
      }
      console.log('使用AI服务商:', latestSettings.aiProvider, '模型:', latestSettings.aiModel);

      const aiService = AIService.fromSettings(latestSettings);

      if (words.length === 1) {
        // 单个单词：使用单个分析接口获得更详细的信息
        console.log('分析单个单词:', words[0]);
        const result = await aiService.analyzeWord(words[0]);
        console.log('单个单词分析结果:', result);
        setAnalysisResult(result);
      } else {
        // 多个单词：使用批量分析接口
        console.log('批量分析单词:', words);
        const results = await aiService.analyzeWords(words);
        console.log('批量分析结果:', results);
        setAnalysisResult(results);
      }
    } catch (error: any) {
      console.error('AI分析失败:', error);
      console.error('错误详情:', error.message, error.response?.data);
      Alert.alert('错误', 'AI分析失败，请检查网络连接或API密钥');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 判断是否为单个单词结果
  const isSingleWordResult = (): boolean => {
    if (!analysisResult) return false;
    return !(analysisResult instanceof Map) && 'definitions' in analysisResult;
  };

  // 获取难度等级（从AI结果或默认值）
  const getDifficulty = (word: string): number => {
    if (analysisResult instanceof Map) {
      return (analysisResult.get(word)?.suggestedDifficulty) || 3;
    } else if (analysisResult) {
      return (analysisResult as AIResponse).suggestedDifficulty || 3;
    }
    return 3;
  };

  // 获取难度描述
  const getDifficultyLabel = (difficulty: number): string => {
    return difficulty <= 2 ? '简单' : difficulty <= 3 ? '中等' : difficulty <= 4 ? '困难' : '极难';
  };

  // 获取难度颜色
  const getDifficultyColor = (difficulty: number): string => {
    switch (difficulty) {
      case 1: return '#4CAF50';
      case 2: return '#8BC34A';
      case 3: return '#FF9800';
      case 4: return '#FF5722';
      case 5: return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const canSave = (): boolean => {
    if (parsedWords.length === 0) return false;
    if (analysisResult) return true;
    return parsedWords.length === 1 && customDefinitions.trim().length > 0;
  };

  // 把当前 state 转成可保存的 AIResponse（按单词取值）
  const buildAnalysisFor = (word: string): AIResponse => {
    if (analysisResult instanceof Map) {
      return analysisResult.get(word) || {
        definitions: [{
          part_of_speech: 'unknown',
          meaning: 'AI分析未覆盖此单词，请手动添加释义',
          example: '',
          is_core: false,
          is_rare_sense: false
        }],
        etymology: '',
        similar_words: [],
        suggestedDifficulty: 3
      };
    }
    if (analysisResult) {
      return analysisResult as AIResponse;
    }
    // 仅手动释义路径（单个单词 + 无 AI 分析）
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
  };

  // 清空表单 state
  const resetForm = () => {
    setInput('');
    setParsedWords([]);
    setAnalysisResult(null);
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
      await StorageService.updateWord(existing.id!, updates);
      console.log(`✏️ 单词 ${existing.word} 覆盖成功`);

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
    console.log('🔵 saveWords 被调用');
    console.log('canSave():', canSave());
    console.log('parsedWords.length:', parsedWords.length);
    console.log('analysisResult:', analysisResult);
    console.log('customDefinitions:', customDefinitions);

    if (!canSave() || parsedWords.length === 0) {
      console.log('❌ 保存条件不满足');
      Alert.alert('提示', '请先进行AI分析或填写手动释义');
      return;
    }

    // 单个单词：若已存在，弹覆盖确认
    if (parsedWords.length === 1) {
      const word = parsedWords[0];
      const existingWords = await StorageService.getWords();
      console.log('🔍 [Overwrite] 单个单词重复检查 - 输入:', word, '词本总数:', existingWords.length);
      const existing = existingWords.find(
        w => (w.word || '').trim().toLowerCase() === word.trim().toLowerCase()
      );
      console.log('🔍 [Overwrite] 命中已有单词:', existing ? `${existing.word} (id=${existing.id})` : '(无)');
      if (existing) {
        const analysis = buildAnalysisFor(word);
        console.log('🔔 [Overwrite] 打开覆盖确认 Dialog');
        setOverwriteDialog({ visible: true, word, existing, analysis });
        return;
      }
    }

    console.log('✅ 开始保存流程');
    try {
      let successCount = 0;
      let failCount = 0;
      let duplicateCount = 0;

      // 先获取所有已有单词
      const existingWords = await StorageService.getWords();
      const existingWordSet = new Set(existingWords.map(w => w.word.toLowerCase()));

      for (const word of parsedWords) {
        console.log(`📝 处理单词: ${word}`);

        // 检查单词是否已存在（批量场景静默跳过）
        if (existingWordSet.has(word.toLowerCase())) {
          console.log(`⏭️ 单词 ${word} 已存在，跳过`);
          duplicateCount++;
          continue;
        }

        try {
          const analysis = buildAnalysisFor(word);
          const difficulty = analysis.suggestedDifficulty || 3;

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
            difficulty,
            frequency: 1
          };

          await StorageService.addWord(wordData);
          console.log(`✅ 单词 ${word} 保存成功`);
          successCount++;
        } catch (error) {
          console.error(`❌ 保存单词 ${word} 失败:`, error);
          failCount++;
        }
      }

      console.log(`📊 保存统计: 成功${successCount}个，失败${failCount}个，重复${duplicateCount}个`);
      const message = `成功保存 ${successCount} 个单词${failCount > 0 ? `，失败 ${failCount} 个` : ''}${duplicateCount > 0 ? `，已有 ${duplicateCount} 个` : ''}`;

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

  const renderDifficultySelector = () => (
    <View style={styles.difficultyContainer}>
      <Text style={styles.label}>AI建议难度等级</Text>
      <View style={styles.difficultyDisplay}>
        {parsedWords.map(word => (
          <Surface key={word} style={styles.difficultyItem}>
            <View style={styles.difficultyItemContent}>
              <Text style={styles.difficultyWord}>{word}</Text>
              <View style={styles.difficultyDots}>
                {[1, 2, 3, 4, 5].map(level => (
                  <View
                    key={level}
                    style={[
                      styles.difficultyDot,
                      {
                        backgroundColor: level <= getDifficulty(word)
                          ? getDifficultyColor(level)
                          : '#E0E0E0'
                      }
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.difficultyText}>{getDifficultyLabel(getDifficulty(word))}</Text>
            </View>
          </Surface>
        ))}
      </View>
      <Text style={styles.helperInfo}>难度由AI智能分析生成，根据考研重要性和理解难度自动评估。可在学习过程中根据成绩动态调整。</Text>
    </View>
  );

  const wordCount = parsedWords.length;

  return (
    <>
    <ScrollView style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>添加新生词</Text>
          <Button
            mode="text"
            compact
            icon="arrow-left"
            onPress={() => navigation.goBack()}
          >
            返回
          </Button>
        </View>
        <Text style={styles.pageSubtitle}>从本地增强词库快速选择，或手工录入并用 AI 补全释义</Text>
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AddWordTab)}
        buttons={[
          { value: 'wordbank', label: '从本地词库选词', icon: 'library-books' },
          { value: 'manual', label: '手工添加新单词', icon: 'pencil-plus' },
        ]}
        style={styles.tabButtons}
      />

      {activeTab === 'wordbank' && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.pickerEntryRow}>
              <MaterialIcons name="library-books" size={40} color="#1976D2" />
              <View style={styles.pickerEntryText}>
                <Text style={styles.pickerEntryTitle}>从本地词库选词</Text>
                <Text style={styles.pickerEntryHint}>4801 个考研词，已含词根、例句和易混词，勾选即可加入生词本</Text>
              </View>
            </View>
            <Button
              mode="contained"
              icon="book-search"
              onPress={() => navigation.navigate('WordbankPicker' as never)}
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
              // 输入变化时同步更新 parsedWords
              const words = parseWords(text);
              setParsedWords(words);
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

          {/* AI分析按钮 */}
          <Button
            mode="contained"
            onPress={analyzeWords}
            loading={isAnalyzing}
            disabled={isAnalyzing || wordCount === 0}
            style={styles.analyzeButton}
            icon="auto-fix"
          >
            {isAnalyzing ? 'AI分析中...' : `AI智能分析 (${wordCount}个)`}
          </Button>
        </Card.Content>
      </Card>

      )}

      {activeTab === 'manual' && isAnalyzing && (
        <Card style={styles.card}>
          <Card.Content style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>AI正在分析单词...</Text>
          </Card.Content>
        </Card>
      )}

      {/* 分析结果 - 单个单词 */}
      {activeTab === 'manual' && analysisResult && isSingleWordResult() && (
        <Card style={styles.card}>
          <Card.Title title="AI分析结果" titleStyle={styles.cardTitle} />
          <Card.Content>
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
      {activeTab === 'manual' && analysisResult && !isSingleWordResult() && (
        <Card style={styles.card}>
          <Card.Title title={`批量AI分析结果 (${(analysisResult as Map<string, AIResponse>).size}个单词)`} titleStyle={styles.cardTitle} />
          <Card.Content>
            {Array.from((analysisResult as Map<string, AIResponse>).entries()).map(([word, analysis]) => (
              <Surface key={word} style={styles.batchWordItem}>
                <Text style={styles.batchWordTitle}>{word}</Text>
                {analysis.definitions && analysis.definitions.length > 0 ? (
                  analysis.definitions.slice(0, 2).map((def, index) => (
                    <View key={index} style={styles.batchDefinition}>
                      <Text style={styles.batchPartOfSpeech}>{def.part_of_speech}</Text>
                      <Text style={styles.batchMeaning}>{def.meaning}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.batchNoAnalysis}>暂无AI分析结果</Text>
                )}
              </Surface>
            ))}
          </Card.Content>
        </Card>
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

      {/* AI建议难度等级显示（分析完成后显示） */}
      {activeTab === 'manual' && analysisResult && renderDifficultySelector()}

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
          保存 ({wordCount}个单词)
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        >
          返回
        </Button>
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
            <Text style={{ fontSize: 12, color: '#666' }}>
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
            buttonColor="#D32F2F"
            textColor="#FFF"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
    flex: 1,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  tabButtons: {
    marginBottom: 16,
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
    color: '#1976D2',
    marginBottom: 2,
  },
  pickerEntryHint: {
    fontSize: 12,
    color: '#666',
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
    color: '#666',
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
    backgroundColor: '#E3F2FD',
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
    color: '#1976D2',
  },
  wordCountChip: {
    backgroundColor: '#1976D2',
  },
  chipText: {
    color: '#FFF',
    fontSize: 12,
  },
  previewWords: {
    fontSize: 12,
    color: '#333',
    lineHeight: 18,
  },
  warningText: {
    fontSize: 11,
    color: '#D32F2F',
    marginTop: 8,
    fontStyle: 'italic',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1976D2',
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
    color: '#1976D2',
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
    color: '#666',
    marginRight: 8,
  },
  meaning: {
    fontSize: 14,
    color: '#333',
  },
  example: {
    fontSize: 12,
    color: '#666',
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
    color: '#333',
  },
  similarWordItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  similarWord: {
    fontSize: 14,
    color: '#333',
  },
  textArea: {
    marginBottom: 16,
  },
  difficultyContainer: {
    marginBottom: 16,
  },
  difficultyDisplay: {
    marginBottom: 12,
  },
  difficultyItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  difficultyItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyWord: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
    minWidth: 80,
  },
  difficultyDots: {
    flexDirection: 'row',
    marginHorizontal: 8,
  },
  difficultyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  difficultyText: {
    fontSize: 12,
    color: '#666',
    minWidth: 50,
    textAlign: 'right',
  },
  helperInfo: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
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
  batchWordTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  batchDefinition: {
    marginBottom: 4,
  },
  batchPartOfSpeech: {
    fontSize: 12,
    color: '#666',
  },
  batchMeaning: {
    fontSize: 14,
    color: '#333',
  },
  batchNoAnalysis: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});