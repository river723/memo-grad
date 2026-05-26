import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Chip, Surface, Button } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Word } from '../types';

export default function WordDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const [word, setWord] = useState<Word | null>(null);

  useEffect(() => {
    const loadWord = async () => {
      const id = route.params?.wordId;
      if (!id) return;

      const loadedWord = await StorageService.getWordById(id);
      setWord(loadedWord);
    };

    loadWord();
  }, [route.params]);

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
        <Text style={styles.wordText}>{word.word}</Text>
        {word.pronunciation_uk && <Text style={styles.pronunciation}>UK {word.pronunciation_uk}</Text>}
        {word.pronunciation_us && <Text style={styles.pronunciation}>US {word.pronunciation_us}</Text>}
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

      {word.similar_words && word.similar_words.length > 0 ? (
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
});
