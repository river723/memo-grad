import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Card, Text, Button, Chip, IconButton } from 'react-native-paper';
import StorageService from '../services/StorageService';
import { Word } from '../types';

// Web 平台兼容性处理
let Speech: any = null;
if (Platform.OS !== 'web') {
  try {
    Speech = require('expo-speech');
  } catch (error) {
    console.warn('expo-speech not available:', error);
  }
}

interface WordCardProps {
  word: Word;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export default function WordCard({ word, onEdit, onDelete, showActions = true }: WordCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await StorageService.getSettings();
        setSoundEnabled(settings.soundEnabled !== false);
      } catch (error) {
        console.error('Failed to load speech settings:', error);
      }
    };

    loadSettings();
  }, []);

  const speakWord = (text: string, lang: 'en-GB' | 'en-US' = 'en-US') => {
    if (!soundEnabled) return;

    if (Speech && Platform.OS !== 'web') {
      Speech.speak(text, {
        language: lang,
        pitch: 1.0,
        rate: 0.8
      });
    } else if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      // Web 平台的语音合成
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const getDifficultyColor = (difficulty: number) => {
    switch (difficulty) {
      case 1: return '#4CAF50'; // 绿色
      case 2: return '#8BC34A';
      case 3: return '#FF9800'; // 橙色
      case 4: return '#FF5722';
      case 5: return '#F44336'; // 红色
      default: return '#9E9E9E';
    }
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        {/* 单词头部 */}
        <View style={styles.header}>
          <View style={styles.wordInfo}>
            <Text variant="headlineSmall" style={styles.word}>
              {word.word}
            </Text>
            <View style={styles.pronunciation}>
              {word.pronunciation_uk && (
                <Text style={styles.pronunciationText}>
                  英 [{word.pronunciation_uk}]
                </Text>
              )}
              {word.pronunciation_us && (
                <Text style={styles.pronunciationText}>
                  美 [{word.pronunciation_us}]
                </Text>
              )}
            </View>
          </View>

          <View style={styles.actions}>
            <IconButton
              icon={soundEnabled ? 'volume-high' : 'volume-off'}
              size={20}
              onPress={() => speakWord(word.word)}
              disabled={!soundEnabled}
            />
            {showActions && (
              <>
                <IconButton
                  icon="pencil"
                  size={20}
                  onPress={onEdit}
                />
                <IconButton
                  icon="delete"
                  size={20}
                  onPress={onDelete}
                />
              </>
            )}
          </View>
        </View>

        {/* 难度 */}
        <View style={styles.meta}>
          <View style={styles.difficulty}>
            <Text style={styles.difficultyLabel}>难度:</Text>
            <View style={styles.difficultyDots}>
              {[1, 2, 3, 4, 5].map(level => (
                <View
                  key={level}
                  style={[
                    styles.difficultyDot,
                    {
                      backgroundColor: level <= word.difficulty
                        ? getDifficultyColor(level)
                        : '#E0E0E0'
                    }
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* 释义列表 */}
        <View style={styles.definitions}>
          {word.definitions.map((def, index) => (
            <View key={index} style={styles.definition}>
              <View style={styles.definitionHeader}>
                <Text style={styles.partOfSpeech}>{def.part_of_speech}</Text>
                {def.is_core && (
                  <Chip mode="flat" compact textStyle={styles.coreLabel}>
                    核心
                  </Chip>
                )}
                {def.is_rare_sense && (
                  <Chip mode="flat" compact textStyle={styles.rareLabel}>
                    熟词僻义
                  </Chip>
                )}
              </View>
              <Text style={styles.meaning}>{def.meaning}</Text>
              {def.example && (
                <Text style={styles.example}>例: {def.example}</Text>
              )}
            </View>
          ))}
        </View>

        {/* 词根词源 */}
        {word.etymology && (
          <View style={styles.etymology}>
            <Text style={styles.etymologyLabel}>词根词缀:</Text>
            <Text style={styles.etymologyText}>{word.etymology}</Text>
          </View>
        )}

        {/* 形近词 */}
        {Array.isArray(word.similar_words) && word.similar_words.length > 0 && (
          <View style={styles.similarWords}>
            <Text style={styles.similarWordsLabel}>易混词:</Text>
            {word.similar_words.map((similar, index) => (
              <View key={index} style={styles.similarWord}>
                <Text style={styles.similarWordText}>
                  {similar.word} ({similar.relation}): {similar.description}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 翻转按钮 */}
        <Button
          mode="outlined"
          onPress={() => setIsFlipped(!isFlipped)}
          style={styles.flipButton}
        >
          {isFlipped ? '显示单词' : '显示释义'}
        </Button>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  wordInfo: {
    flex: 1,
  },
  word: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  pronunciation: {
    marginTop: 4,
  },
  pronunciationText: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  actions: {
    flexDirection: 'row',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  difficulty: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  difficultyLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  difficultyDots: {
    flexDirection: 'row',
  },
  difficultyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 1,
  },
  definitions: {
    marginBottom: 12,
  },
  definition: {
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#E3F2FD',
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
  coreLabel: {
    fontSize: 10,
    color: '#1976D2',
  },
  rareLabel: {
    fontSize: 10,
    color: '#F57C00',
  },
  meaning: {
    fontSize: 14,
    lineHeight: 20,
  },
  example: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  etymology: {
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  etymologyLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  etymologyText: {
    fontSize: 12,
    color: '#666',
  },
  similarWords: {
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  similarWordsLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  similarWord: {
    marginBottom: 2,
  },
  similarWordText: {
    fontSize: 12,
    color: '#666',
  },
  flipButton: {
    marginTop: 8,
  },
});