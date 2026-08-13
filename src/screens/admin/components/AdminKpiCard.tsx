/**
 * KPI 数字卡片。给 AdminOverviewScreen 用。
 */
import React from 'react';
import { View } from 'react-native';
import { Card, Text } from 'react-native-paper';
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
    card: { flex: 1, minWidth: 140, margin: 4, backgroundColor: c.surface, elevation: 1 },
    content: { padding: 12 },
    label: { fontSize: 12, color: c.onSurfaceVariant },
    value: { fontSize: 22, fontWeight: '700', color: color ?? c.onSurface, marginTop: 4 },
    hint: { fontSize: 11, color: c.onSurfaceVariant, marginTop: 2 },
  }));
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </Card.Content>
    </Card>
  );
}
