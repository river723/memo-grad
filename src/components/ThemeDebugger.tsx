import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { useThemeContext } from '../providers/ThemeProvider';

/**
 * 主题调试组件 - 显示当前主题信息和颜色样本
 */
export default function ThemeDebugger() {
  const { colors, dark } = useAppTheme();
  const { themeMode, setThemeMode } = useThemeContext();
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>主题调试信息</Text>

      <Text style={styles.info}>当前主题模式: {themeMode}</Text>
      <Text style={styles.info}>深色模式: {dark ? '是' : '否'}</Text>

      <View style={styles.colorSamples}>
        <View style={[styles.colorBox, { backgroundColor: colors.background }]}>
          <Text style={styles.colorLabel}>background</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.surface }]}>
          <Text style={styles.colorLabel}>surface</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.primary }]}>
          <Text style={styles.colorLabel}>primary</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.onSurface }]}>
          <Text style={styles.colorLabel}>onSurface</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.outline }]}>
          <Text style={styles.colorLabel}>outline</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.accent }]}>
          <Text style={styles.colorLabel}>accent</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.success }]}>
          <Text style={styles.colorLabel}>success</Text>
        </View>
        <View style={[styles.colorBox, { backgroundColor: colors.danger }]}>
          <Text style={styles.colorLabel}>danger</Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setThemeMode('light')}
        >
          <Text style={styles.buttonText}>浅色</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setThemeMode('dark')}
        >
          <Text style={styles.buttonText}>深色</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setThemeMode('system')}
        >
          <Text style={styles.buttonText}>跟随系统</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    padding: 16,
    backgroundColor: colors.background,
    margin: 16,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.primary,
  },
  info: {
    fontSize: 14,
    marginBottom: 8,
    color: colors.onSurface,
  },
  colorSamples: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  colorBox: {
    width: 80,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  colorLabel: {
    fontSize: 10,
    color: colors.onSurface,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 12,
    marginHorizontal: 4,
    backgroundColor: colors.primary,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.onPrimaryContainer,
    fontWeight: 'bold',
  },
}));