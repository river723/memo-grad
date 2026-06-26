import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { Text, Chip, Surface, Button, IconButton, ActivityIndicator } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import StorageService from '../services/StorageService';
import AIService from '../services/AIService';
import { Word, AppSettings } from '../types';
import {
  canWordBeEnhanced,
  getLocalWordDictResult,
  mergeAIResultIntoWord,
  needsWordEnhancement,
} from '../utils/wordUtils';

// Web 平台兼容性处理
let Speech: any = null;
if (Platform.OS !== 'web') {
  try {
    Speech = require('expo-speech');
  } catch (error) {
    console.warn('expo-speech not available:', error);
  }
}

// 判断与合并逻辑统一在 utils/wordUtils
export default function WordDetailScreen() {
  const route = useAppRoute<'WordDetail'>();
  const navigation = useAppNavigation();
  const [word, setWord] = useState<Word | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [enhancing, setEnhancing] = useState(false);

  useEffect(() => {
    const loadWord = async () => {
      const id = route.params?.wordId;
      if (!id) return;

      const [loadedWord, appSettings] = await Promise.all([
        StorageService.getWordById(id),
        StorageService.getSettings(),
      ]);
      setWord(loadedWord);
      setSettings(appSettings);
      setSoundEnabled(appSettings.soundEnabled !== false);
    };

    loadWord();
  }, [route.params]);

  const enhanceWord = async () => {
    if (!word) return;
    setEnhancing(true);
    try {
      const localResult = getLocalWordDictResult(word.word);
      const result = localResult || (settings
        ? await AIService.fromSettings(settings).analyzeWord(word.word)
        : null);

      if (!result) return;

      const merged = mergeAIResultIntoWord(word, result);

      if (word.id != null) {
        await StorageService.updateWord(word.id, merged);
      }
      setWord({ ...word, ...merged });
    } catch (err) {
      console.warn('单词增强失败，保持词库版本:', err);
      // 静默失败，UI 仍显示词库原值
    } finally {
      setEnhancing(false);
    }
  };

  const localWordDictResult = word ? getLocalWordDictResult(word.word) : null;
  const canEnhance = !!(
    word &&
    needsWordEnhancement(word) &&
    (localWordDictResult || canWordBeEnhanced(word, settings))
  );

  const speakWord = (text: string) => {
    if (!soundEnabled) return;

    if (Speech && Platform.OS !== 'web') {
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.8,
      });
    } else if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!word) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>未找到该单词</Text>
        <Button onPress={() => navigation.goBack()}>返回</Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.card}>
        <View style={styles.wordHeader}>
          <View style={styles.wordInfo}>
            <Text style={styles.wordText}>{word.word}</Text>
            {word.pronunciation_uk && <Text style={styles.pronunciation}>UK {word.pronunciation_uk}</Text>}
            {word.pronunciation_us && <Text style={styles.pronunciation}>US {word.pronunciation_us}</Text>}
          </View>
          <IconButton
            icon={soundEnabled ? 'volume-high' : 'volume-off'}
            size={28}
            onPress={() => speakWord(word.word)}
            disabled={!soundEnabled}
          />
        </View>
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.sectionTitle}>释义</Text>
        {word.definitions.map((def, index) => (
          <Surface key={index} style={styles.definitionItem}>
            <View style={styles.definitionHeader}>
              <Text style={styles.definitionLabel}>{def.part_of_speech}</Text>
              {def.is_core && <Chip compact style={styles.chip}>核心</Chip>}
              {def.is_rare_sense && <Chip compact style={styles.chip}>熟词僻义</Chip>}
            </View>
            <Text style={styles.definitionMeaning}>{def.meaning}</Text>
            {def.example ? <Text style={styles.definitionExample}>例句：{def.example}</Text> : null}
          </Surface>
        ))}
      </Surface>

      {word.etymology ? (
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>词根词缀</Text>
          <Text style={styles.sectionText}>{word.etymology}</Text>
        </Surface>
      ) : null}

      {Array.isArray(word.similar_words) && word.similar_words.length > 0 ? (
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>易混词 / 相似词</Text>
          {word.similar_words.map((item, index) => (
            <View key={index} style={styles.similarItem}>
              <Text style={styles.similarWord}>{item.word} ({item.relation})</Text>
              <Text style={styles.similarDescription}>{item.description}</Text>
            </View>
          ))}
        </Surface>
      ) : null}

      {/* 信息补全：优先用本地词典，未命中且已配置 AI 时再调用 AI */}
      {canEnhance && !enhancing ? (
        <Button
          mode="outlined"
          icon="auto-fix"
          onPress={enhanceWord}
          style={styles.enhanceBtn}
        >
          {localWordDictResult ? '本地词典补全词根、例句、近义词' : 'AI 补全词根、例句、近义词'}
        </Button>
      ) : null}
      {enhancing ? (
        <Surface style={styles.enhancingBar}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.enhancingText}>AI 正在补全...</Text>
        </Surface>
      ) : null}

      <Button mode="contained" onPress={() => navigation.goBack()} style={styles.backButton}>
        返回
      </Button>
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
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  emptyText: {
    fontSize: 18,
    marginBottom: 16,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  wordInfo: {
    flex: 1,
  },
  wordText: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pronunciation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  definitionItem: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
  },
  definitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  definitionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
  },
  chip: {
    marginLeft: 8,
  },
  definitionMeaning: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  definitionExample: {
    fontSize: 13,
    color: '#555',
  },
  sectionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  similarItem: {
    marginBottom: 12,
  },
  similarWord: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  similarDescription: {
    fontSize: 13,
    color: '#555',
  },
  backButton: {
    marginTop: 16,
  },
  enhancingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  enhancingText: {
    fontSize: 13,
    color: '#1976D2',
    marginLeft: 4,
  },
  enhanceBtn: {
    marginBottom: 12,
    borderRadius: 8,
  },
});
