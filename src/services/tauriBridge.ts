/**
 * Tauri 桌面端桥接层（默认实现，web/Tauri 构建使用）。
 *
 * 注意：Metro/Hermes 不支持动态 import() 语法（会报 "Invalid expression encountered"），
 * 因此 iOS/Android 构建会解析到 tauriBridge.native.ts（无 import 的占位实现），
 * 本文件不会被原生打包。
 */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type TauriSaveResult = 'saved' | 'canceled';

/** 弹出 Tauri 原生"另存为"对话框，由用户选择保存位置并写入文件。 */
export async function saveFileViaTauri(
  fileName: string,
  content: Uint8Array
): Promise<TauriSaveResult> {
  // 动态导入仅在 Tauri 桌面端走到；用 webpackIgnore 避免 web 构建试图解析这些模块。
  const { save } = await import(/* webpackIgnore: true */ '@tauri-apps/plugin-dialog');
  const { writeFile } = await import(/* webpackIgnore: true */ '@tauri-apps/plugin-fs');
  const filePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'MemoGrad 备份', extensions: ['bk'] }],
  });
  if (!filePath) {
    return 'canceled';
  }
  await writeFile(filePath, content);
  return 'saved';
}
