/**
 * 用户头像：圆形 + 文字首字母 fallback。
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../../theme/theme';
import { makeStyles } from '../../../utils/useStyles';

export default function UserAvatar({ name, size = 36 }: { name: string | null; size?: number }) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    avatar: {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    },
    text: { color: '#ffffff', fontWeight: '700', fontSize: size * 0.45 },
  }));
  const styles = useStyles();
  const initial = (name && name.trim().length > 0) ? name.trim()[0].toUpperCase() : '?';
  return (
    <View style={styles.avatar}>
      <Text style={styles.text}>{initial}</Text>
    </View>
  );
}
