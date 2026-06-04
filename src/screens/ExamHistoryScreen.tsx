import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  IconButton,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { ExamSession } from '../types';

export default function ExamHistoryScreen() {
  const navigation = useNavigation();
  const [sessions, setSessions] = useState<ExamSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  const loadSessions = async () => {
    const all = await StorageService.getExamSessions();
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setSessions(all);
  };

  const handleDelete = (id: number) => {
    Alert.alert('删除记录', '确定要删除这套考题吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteExamSession(id);
          loadSessions();
        },
      },
    ]);
  };

  const handleRedo = (session: ExamSession) => {
    navigation.navigate('ExamAnswer' as never, {
      questions: session.questions,
      questionType: session.question_type,
      sessionId: session.id,
    } as never);
  };

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return '#4CAF50';
    if (rate >= 0.6) return '#FF9800';
    return '#F44336';
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${mins}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>暂无考题记录</Text>
          <Text style={styles.emptyHint}>完成考题练习后可在此复习</Text>
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('ExamSetup' as never)}
            style={styles.emptyButton}
          >
            去做一组练习
          </Button>
        </View>
      ) : (
        sessions.map(session => {
          const total = session.questions.length;
          const correct = session.answers.filter(a => a.is_correct).length;

          return (
            <TouchableOpacity
              key={session.id}
              onPress={() => handleRedo(session)}
              activeOpacity={0.7}
            >
              <Card style={styles.sessionCard}>
                <Card.Content>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionDate}>{formatDate(session.created_at)}</Text>
                      <Text style={styles.sessionType}>
                        {session.question_type === 'definition' ? '释义单选' : '完形选词'}
                        {' · '}{total} 题
                        {' · 上次答对 '}{correct} 题
                      </Text>
                    </View>
                    <View style={styles.sessionScoreRow}>
                      <Text style={[styles.sessionScore, { color: getAccuracyColor(session.accuracy) }]}>
                        {Math.round(session.accuracy * 100)}%
                      </Text>
                      <Text style={styles.sessionCount}>{correct}/{total}</Text>
                    </View>
                  </View>
                </Card.Content>
                <IconButton
                  icon="delete"
                  iconColor="#999"
                  size={18}
                  style={styles.deleteIcon}
                  onPress={() => handleDelete(session.id!)}
                />
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#999', marginBottom: 24 },
  emptyButton: { borderRadius: 12 },
  sessionCard: { borderRadius: 12, elevation: 2, marginBottom: 10, position: 'relative' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 32 },
  sessionInfo: { flex: 1 },
  sessionDate: { fontSize: 15, fontWeight: '600', color: '#333' },
  sessionType: { fontSize: 12, color: '#888', marginTop: 2 },
  sessionScoreRow: { alignItems: 'flex-end' },
  sessionScore: { fontSize: 24, fontWeight: '800' },
  sessionCount: { fontSize: 12, color: '#888', marginTop: 1 },
  deleteIcon: { position: 'absolute', top: 4, right: 4 },
});
