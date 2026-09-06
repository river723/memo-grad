/**
 * 统一的后端 API 基地址。
 *
 * 所有服务模块（ApiClient / RealExamApi / StoryApi / WordDictApi）共用此地址，
 * 避免在四个文件里各自写死、换部署地址时还要逐处改、重打包。
 *
 * 优先级：
 * 1. 打包/运行时环境变量 EXPO_PUBLIC_API_URL（Expo 会把 EXPO_PUBLIC_* 内联进前端包）。
 *    打包桌面端时用它覆盖，例如：
 *      EXPO_PUBLIC_API_URL="http://<公网IP>:<端口>" npx tauri build
 * 2. 开发态回退到本机 3000。
 * 3. 生产态默认指向公网域名（dict.river723.work，DNS 指向飞牛 NAS 的 5888 端口）。
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? 'http://127.0.0.1:3000' : 'http://dict.river723.work:5888');
