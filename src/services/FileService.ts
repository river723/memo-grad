import { format } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { Platform } from 'react-native';

export type ExportFileResult = 'shared' | 'downloaded' | 'saved' | 'canceled';

/** Tauri v2 桌面端会注入该内部对象；浏览器/移动端无。 */
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

class FileService {
  generateBackupFileName(): string {
    return `memo-grad-backup-${format(new Date(), 'yyyyMMdd-HHmm')}.bk`;
  }

  async exportBackupFile(jsonContent: string, fileName: string): Promise<ExportFileResult> {
    const compressed = gzipSync(strToU8(jsonContent));

    // Tauri 桌面端：弹出原生"另存为"对话框，由用户选择保存位置
    if (isTauri()) {
      try {
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
        await writeFile(filePath, compressed);
        return 'saved';
      } catch (error) {
        // 插件调用失败时回退到浏览器下载，避免阻断导出
        console.warn('Tauri 导出失败，回退到下载方式:', error);
      }
    }

    if (Platform.OS === 'web') {
      this.downloadBackupFile(compressed, fileName);
      return 'downloaded';
    }

    const file = new File(Paths.document, fileName);
    file.create({ overwrite: true });
    file.write(compressed);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new Error('当前设备不支持系统分享，无法导出备份文件。');
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: '导出学习数据备份',
      UTI: 'public.data',
    });

    return 'shared';
  }

  async pickAndReadBackupFile(): Promise<string | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];
    if (!asset) {
      return null;
    }

    if (!asset.name.toLowerCase().endsWith('.bk')) {
      throw new Error('请选择本应用导出的 .bk 备份文件。');
    }

    const compressed = await this.readAssetBytes(asset);

    try {
      return strFromU8(gunzipSync(compressed));
    } catch (error) {
      throw new Error('备份文件已损坏或格式不正确，无法解压。');
    }
  }

  private async readAssetBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
    if (Platform.OS === 'web') {
      if (asset.file) {
        return new Uint8Array(await asset.file.arrayBuffer());
      }
      if (asset.base64) {
        return this.decodeBase64ToBytes(asset.base64);
      }
    }

    const file = new File(asset.uri);
    return file.bytes();
  }

  private downloadBackupFile(content: Uint8Array, fileName: string) {
    const buffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private decodeBase64ToBytes(base64: string): Uint8Array {
    if (typeof atob === 'function') {
      const binary = atob(base64);
      return Uint8Array.from(binary, char => char.charCodeAt(0));
    }

    throw new Error('当前环境不支持读取该备份文件内容');
  }
}

export default new FileService();
