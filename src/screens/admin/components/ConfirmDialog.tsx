/**
 * 通用确认对话框。所有 11 个敏感操作统一走这里，确保文案/按钮颜色一致。
 *
 * 用法：
 *   const [confirm, ConfirmNode] = useConfirmDialog();
 *   const onPress = async () => {
 *     const ok = await confirm({
 *       title: '确认退款',
 *       body: '订单 X 将被标记为已退款。此操作不可撤销。',
 *       confirmText: '确认退款',
 *       danger: true,
 *       requireReason: true,         // 弹一个 TextInput，强制管理员填原因
 *       reasonLabel: '退款原因',
 *     });
 *     if (!ok) return;
 *     // do stuff with reason
 *   };
 *   return <View>...{ConfirmNode}</View>;
 */

import React, { useState, useCallback, useRef } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Portal, TextInput, Text, HelperText } from 'react-native-paper';
import { useAppTheme } from '../../../theme/theme';
import { makeStyles } from '../../../utils/useStyles';

export interface ConfirmOptions {
  title: string;
  /** 详细说明后果，必填。 */
  body: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（红按钮） */
  danger?: boolean;
  /** 强制要求填备注；典型场景：封禁原因 / 退款原因 */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
}

export type ConfirmResult =
  | { confirmed: true; reason: string }
  | { confirmed: false };

export function useConfirmDialog() {
  const [state, setState] = useState<{
    visible: boolean;
    options: ConfirmOptions | null;
    resolve: ((r: ConfirmResult) => void) | null;
  }>({ visible: false, options: null, resolve: null });
  const reasonRef = useRef('');

  const confirm = useCallback((options: ConfirmOptions): Promise<ConfirmResult> => {
    return new Promise<ConfirmResult>((resolve) => {
      reasonRef.current = '';
      setState({ visible: true, options, resolve });
    });
  }, []);

  const onCancel = useCallback(() => {
    state.resolve?.({ confirmed: false });
    setState({ visible: false, options: null, resolve: null });
  }, [state.resolve]);

  const onConfirm = useCallback(() => {
    if (state.options?.requireReason && !reasonRef.current.trim()) return;
    state.resolve?.({ confirmed: true, reason: reasonRef.current.trim() });
    setState({ visible: false, options: null, resolve: null });
  }, [state.resolve, state.options]);

  const node = state.options ? (
    <ConfirmDialogView
      visible={state.visible}
      options={state.options}
      onReasonChange={(v) => { reasonRef.current = v; }}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  ) : null;

  return [confirm, node] as const;
}

function ConfirmDialogView({
  visible, options, onReasonChange, onCancel, onConfirm,
}: {
  visible: boolean;
  options: ConfirmOptions;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useAppTheme();
  const useStyles = makeStyles((c) => ({
    dialog: { backgroundColor: c.surface },
    body: { color: c.onSurfaceVariant, marginBottom: 12, lineHeight: 20 },
    reasonInput: { marginTop: 4, backgroundColor: c.surface },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  }));
  const styles = useStyles();

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={styles.dialog}>
        <Dialog.Title>{options.title}</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.body}>{options.body}</Text>
          {options.requireReason ? (
            <View>
              <TextInput
                mode="outlined"
                label={options.reasonLabel || '原因（必填）'}
                placeholder={options.reasonPlaceholder}
                onChangeText={onReasonChange}
                style={styles.reasonInput}
                multiline
              />
              <HelperText type="info" visible>
                此原因将记录在审计日志中
              </HelperText>
            </View>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <View style={styles.buttonRow}>
            <Button onPress={onCancel}>{options.cancelText || '取消'}</Button>
            <Button
              mode="contained"
              buttonColor={options.danger ? colors.error : colors.primary}
              onPress={onConfirm}
            >
              {options.confirmText || '确认'}
            </Button>
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
