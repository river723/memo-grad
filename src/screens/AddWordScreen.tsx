import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Text,
  Chip,
  ActivityIndicator,
  Surface,
  IconButton,
  SegmentedButtons
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import AIService from '../services/AIService';
import { Word, WordCategory, AIResponse } from '../types';
import { WORD_CATEGORIES } from '../constants';

export default function AddWordScreen() {
  const navigation = useNavigation();
  const [word, setWord] = useState('');
  const [category, setCategory] = useState<WordCategory>('reading');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIResponse | null>(null);
  const [customDefinitions, setCustomDefinitions] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [difficulty, setDifficulty] = useState(3);

  // 分析单词
  const analyzeWord = async () => {
    if (!word.trim()) {
      Alert.alert('提示', '请输入单词');
      return;
    }

    setIsAnalyzing(true);
    try {
      // 这里需要配置你的OpenRouter API密钥
      const aiService = new AIService('your-api-key-here');
      const analysis = await aiService.analyzeWord(word.trim());
      setAiAnalysis(analysis);
    } catch (error) {
      console.error('AI分析失败:', error);
      Alert.alert('错误', 'AI分析失败，请检查网络连接或API密钥');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 保存单词
  const saveWord = async () => {
    if (!word.trim()) {
      Alert.alert('提示', '请输入单词');
      return;
    }

    try {
      const wordData: Omit<Word, 'id'> = {
        word: word.trim().toLowerCase(),
        pronunciation_uk: pronunciation || undefined,
        pronunciation_us: pronunciation || undefined,
        definitions: aiAnalysis?.definitions || [
          {
            part_of_speech: 'unknown',
            meaning: customDefinitions || '待添加释义',
            example: '',
            is_core: false,
            is_rare_sense: false
          }
        ],
        etymology: aiAnalysis?.etymology || '',
        similar_words: aiAnalysis?.similar_words || [],
        category,
        difficulty,
        frequency: 1
      };

      await StorageService.addWord(wordData);

      Alert.alert(
        '成功',
        `单词 "${word}" 已添加到生词本`,
        [
          {
            text: '继续添加',
            onPress: () => {
              setWord('');
              setAiAnalysis(null);
              setCustomDefinitions('');
              setPronunciation('');
              setDifficulty(3);
            }
          },
          {
            text: '返回首页',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('保存单词失败:', error);
      Alert.alert('错误', '保存失败，请重试');
    }
  };

  // 难度选择器
  const renderDifficultySelector = () => (
    <View style={styles.difficultyContainer}>
      <Text style={styles.label}>难度等级</Text>
      <View style={styles.difficultyButtons}>
        {[1, 2, 3, 4, 5].map(level => (
          <Button
            key={level}
            mode={difficulty === level ? 'contained' : 'outlined'}
            onPress={() => setDifficulty(level)}
            style={styles.difficultyButton}
            compact
          >
            {level}
          </Button>
        ))}
      </View>
      <Text style={styles.difficultyHint}>
        {difficulty <= 2 ? '简单' : difficulty <= 3 ? '中等' : difficulty <= 4 ? '困难' : '极难'}
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title title="添加新单词" titleStyle={styles.cardTitle} />
        <Card.Content>
          {/* 单词输入 */}
          <TextInput
            label="输入英文单词"
            value={word}
            onChangeText={setWord}
            mode="outlined"
            style={styles.input}
            placeholder="例如: abandon"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* 音标输入 */}
          <TextInput
            label="音标 (可选)"
            value={pronunciation}
            onChangeText={setPronunciation}
            mode="outlined"
            style={styles.input}
            placeholder="例如: [əˈbændən]"
          />

          {/* 分类选择 */}
          <Text style={styles.label}>单词分类</Text>
          <SegmentedButtons
            value={category}
            onValueChange={(value) => setCategory(value as WordCategory)}
            buttons={[
              { value: 'reading', label: '阅读' },
              { value: 'cloze', label: '完型' },
              { value: 'translation', label: '翻译' },
              { value: 'writing', label: '作文' }
            ]}
            style={styles.segmentedButtons}
          />

          {/* AI分析按钮 */}
          <Button
            mode="contained"
            onPress={analyzeWord}
            loading={isAnalyzing}
            disabled={isAnalyzing || !word.trim()}
            style={styles.analyzeButton}
            icon="auto-fix"
          >
            {isAnalyzing ? 'AI分析中...' : 'AI智能分析'}
          </Button>
        </Card.Content>
      </Card>

      {/* AI分析结果 */}
      {isAnalyzing && (
        <Card style={styles.card}>
          <Card.Content style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>AI正在分析单词...</Text>
          </Card.Content>
        </Card>
      )}

      {aiAnalysis && (
        <Card style={styles.card}>
          <Card.Title title="AI分析结果" titleStyle={styles.cardTitle} />
          <Card.Content>
            {/* 释义 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📚 考研释义</Text>
              {aiAnalysis.definitions?.map((def, index) => (
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
            {aiAnalysis.etymology && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔍 词根词缀</Text>
                <Surface style={styles.etymologyContainer}>
                  <Text style={styles.etymologyText}>{aiAnalysis.etymology}</Text>
                </Surface>
              </View>
            )}

            {/* 形近词 */}
            {aiAnalysis.similar_words && aiAnalysis.similar_words.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚠️ 易混词提醒</Text>
                {aiAnalysis.similar_words.map((similar, index) => (
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

      {/* 手动添加释义 */}
      {!aiAnalysis && (
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

      {/* 难度选择 */}
      {renderDifficultySelector()}

      {/* 保存按钮 */}
      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={saveWord}
          style={styles.saveButton}
          icon="content-save"
        >
          保存到生词本
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        >
          取消
        </Button>
      </View>
    </ScrollView>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 16,
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
    lineHeight: 20,
    marginBottom: 4,
  },
  example: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  etymologyContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  etymologyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1976D2',
  },
  similarWordItem: {
    padding: 8,
    marginBottom: 4,
    borderRadius: 4,
    backgroundColor: '#FFF3E0',
  },
  similarWord: {
    fontSize: 12,
    color: '#F57C00',
  },
  textArea: {
    minHeight: 80,
  },
  difficultyContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
  },
  difficultyButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  difficultyButton: {
    flex: 1,
    marginHorizontal: 2,
  },
  difficultyHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
  buttonContainer: {
    marginBottom: 32,
  },
  saveButton: {
    marginBottom: 12,
  },
  cancelButton: {
    marginBottom: 16,
  },
});