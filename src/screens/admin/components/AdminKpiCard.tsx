/**
 * KPI 数字卡片：带图标 + 阴影，给 AdminOverviewScreen 用。
 */
import React from 'react';
import { View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/theme';
import { makeStyles } from '../../../utils/useStyles';

export interface AdminKpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: string;
  color?: string;
}

export default function AdminKpiCard({ label, value, hint, icon, color }: AdminKpiCardProps) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    card: {
      flex: 1, minWidth: 140, margin: 6,
      backgroundColor: c.surface,
      borderRadius: 10,
      elevation: 2,
    },
    content: { padding: 14 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconWrap: {
      width: 30, height: 30, borderRadius: 8,
      backgroundColor: (color ?? c.primary) + '18',
      alignItems: 'center', justifyContent: 'center',
    },
    icon: { fontSize: 16 },
    label: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 8, fontWeight: '500' },
    value: { fontSize: 22, fontWeight: '700', color: color ?? c.onSurface, marginTop: 2, lineHeight: 26 },
    hint: { fontSize: 10, color: c.onSurfaceVariant, marginTop: 4 },
  }));
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.label}>{label}</Text>
          {icon ? (
            <View style={styles.iconWrap}>
              <MaterialIcons name={icon as any} size={16} color={color ?? colors.primary} style={styles.icon} />
            </View>
          ) : null}
        </View>
        <Text style={styles.value}>{value}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </Card.Content>
    </Card>
  );
}
