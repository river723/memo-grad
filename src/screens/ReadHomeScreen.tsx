import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import StoryListScreen from './StoryListScreen';
import ArticleListScreen from './ArticleListScreen';

type ReadTabKey = 'story' | 'article';

const SEGMENTS: { key: ReadTabKey; label: string; icon: string }[] = [
  { key: 'story', label: '系列故事', icon: 'auto-stories' },
  { key: 'article', label: '趣味文章', icon: 'article' },
];

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingBottom: 8,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  segmentActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.tertiary,
  },
  segmentLabelActive: {
    color: colors.primary,
  },
  body: {
    flex: 1,
  },
}));

export default function ReadHomeScreen() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [active, setActive] = useState<ReadTabKey>('story');

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        {SEGMENTS.map((seg) => {
          const isActive = active === seg.key;
          return (
            <TouchableOpacity
              key={seg.key}
              style={[styles.segment, isActive && styles.segmentActive]}
              activeOpacity={0.7}
              onPress={() => setActive(seg.key)}
            >
              <MaterialIcons
                name={seg.icon as any}
                size={18}
                color={isActive ? colors.primary : colors.tertiary}
              />
              <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 两个列表都挂载，用显隐切换以保留各自滚动位置与状态 */}
      <View style={styles.body}>
        <View style={[styles.body, active !== 'story' && { display: 'none' }]}>
          <StoryListScreen />
        </View>
        <View style={[styles.body, active !== 'article' && { display: 'none' }]}>
          <ArticleListScreen />
        </View>
      </View>
    </View>
  );
}
