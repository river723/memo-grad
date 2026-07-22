// src/components/SortPicker.tsx
//
// 排序下拉选择器。展示当前排序，点击弹出可选项。
// 泛型 T 为排序值类型，供 DictionaryBrowse 等页面复用。
//
// 注意：不使用 react-native-paper 的 Menu —— 它内部用 findNodeHandle 测量
// 锚点，在 react-native-web 0.21 上会抛错。改为纯绝对定位的自定义下拉，
// 保证 web 与原生都可用。

import React, { useState } from 'react';
import { View, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { makeStyles } from '../utils/useStyles';

export interface SortOption<T> {
  value: T;
  label: string;
}

interface SortPickerProps<T> {
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function SortPicker<T extends string>({
  options,
  value,
  onChange,
}: SortPickerProps<T>) {
  const [visible, setVisible] = useState(false);
  const styles = useStyles();
  const current = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Button
        mode="outlined"
        icon="sort"
        compact
        onPress={() => setVisible(true)}
      >
        {current ? current.label : '排序'}
      </Button>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        {/* 点击遮罩关闭 */}
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Surface style={styles.menu} elevation={3}>
              <Text style={styles.menuTitle}>排序方式</Text>
              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <TouchableOpacity
                    key={String(o.value)}
                    style={styles.item}
                    onPress={() => {
                      onChange(o.value);
                      setVisible(false);
                    }}
                  >
                    <Text
                      style={[styles.itemText, selected && styles.itemTextActive]}
                    >
                      {o.label}
                    </Text>
                    {selected && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </Surface>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: {
    alignSelf: 'flex-start',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '80%',
    maxWidth: 320,
  },
  menu: {
    borderRadius: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.onSurfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemText: {
    fontSize: 15,
    color: colors.onSurface,
  },
  itemTextActive: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  check: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: 'bold',
  },
}));
