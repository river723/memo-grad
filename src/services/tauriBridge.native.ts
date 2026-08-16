/**
 * iOS/Android 占位实现：Tauri 不可用。
 * Metro 平台后缀解析：iOS/Android 构建会优先选择本文件而非 tauriBridge.ts。
 * 本文件不包含动态 import() 语法，保证 Hermes 字节码可编译。
 */

export const isTauri = (): boolean => false;

export type TauriSaveResult = 'saved' | 'canceled';

export async function saveFileViaTauri(
  _fileName: string,
  _content: Uint8Array
): Promise<TauriSaveResult> {
  return 'canceled';
}
