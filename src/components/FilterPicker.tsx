// src/components/FilterPicker.tsx
//
// 单选筛选下拉器（可清空）。显示 label + 当前选中项，含「全部」用于
// 清空（value=null）。供 DictionaryBrowse 的难度/考频筛选复用。
//
// 注意：不使用 react-native-paper 的 Menu —— 它内部用 findNodeHandle 测量
// 锚点，在 react-native-web 0.21 上会抛错。改为纯绝对定位的自定义下拉。

import React, { useState } from 'react';
import { View, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { makeStyles } from '../utils/useStyles';

export interface FilterOption {
  value: number;
  label: string;
}

interface FilterPickerProps {
  label: string;
  options: FilterOption[];
  value: number | null;
  onChange: (value: number | null) => void;
}

export default function FilterPicker({
  label,
  options,
  value,
  onChange,
}: FilterPickerProps) {
  const [visible, setVisible] = useState(false);
  const styles = useStyles();
  const current = options.find((o) => o.value === value);
  const buttonLabel = current ? `${label}:${current.label}` : label;

  const select = (v: number | null) => {
    onChange(v);
    setVisible(false);
  };

  return (
    <View style={styles.wrapper}>
      <Button
        mode={value !== null ? 'contained-tonal' : 'outlined'}
        icon="filter-variant"
        compact
        onPress={() => setVisible(true)}
      >
        {buttonLabel}
      </Button>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Surface style={styles.menu} elevation={3}>
              <Text style={styles.menuTitle}>{label}筛选</Text>

              <TouchableOpacity style={styles.item} onPress={() => select(null)}>
                <Text
                  style={[styles.itemText, value === null && styles.itemTextActive]}
                >
                  全部
                </Text>
                {value === null && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>

              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={styles.item}
                    onPress={() => select(o.value)}
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
