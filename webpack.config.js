// webpack.config.js
// 为 Expo Web 构建添加 Node.js 核心模块的 polyfill 配置，
// 并将资源路径设置为相对路径，以便在 Tauri 中通过本地协议正确加载。

const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const webpack = require('webpack');

module.exports = async function (env, argv) {
  // 获取 Expo 默认的 webpack 配置
  const config = await createExpoWebpackConfigAsync(env, argv);

  // 应用形态开关（与 src/config/appMode.ts 对应）。
  // Metro 链由 Expo 内联 EXPO_PUBLIC_*；webpack/Tauri 链在这里显式注入，
  // 桌面离线包经 scripts/build-web-offline.mjs 设置环境变量后构建。
  config.plugins = config.plugins || [];
  config.plugins.push(
    new webpack.DefinePlugin({
      'process.env.EXPO_PUBLIC_OFFLINE_MODE': JSON.stringify(
        process.env.EXPO_PUBLIC_OFFLINE_MODE
      ),
      'process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT': JSON.stringify(
        process.env.EXPO_PUBLIC_USE_REMOTE_CONTENT
      ),
      'process.env.EXPO_PUBLIC_API_URL': JSON.stringify(
        process.env.EXPO_PUBLIC_API_URL
      ),
    })
  );


  // 添加 Node.js 核心模块的 fallback
  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...config.resolve.fallback,
    path: false,        // 不需要 path 模块的 polyfill
    fs: false,          // 不需要 fs 模块的 polyfill
    crypto: false,      // 不需要 crypto 模块的 polyfill
    stream: false,      // 不需要 stream 模块的 polyfill
    http: false,        // 不需要 http 模块的 polyfill
    https: false,       // 不需要 https 模块的 polyfill
    os: false,          // 不需要 os 模块的 polyfill
    url: false,         // 不需要 url 模块的 polyfill
    zlib: false,        // 不需要 zlib 模块的 polyfill
    net: false,         // 不需要 net 模块的 polyfill
    tls: false,         // 不需要 tls 模块的 polyfill
    child_process: false, // 不需要 child_process 模块的 polyfill
  };

  // 仅在生产构建时使用相对路径 publicPath，以便在 Tauri 中通过本地协议加载本地资源。
  // 开发模式（expo start --web）必须保持默认的 '/'，否则动态加载的 chunk 在非根路径下会 404。
  const isDev =
    (argv && argv.mode === 'development') || (env && env.mode === 'development');
  if (!isDev) {
    config.output = config.output || {};
    config.output.publicPath = './';
  }

  // react-native-paper / react-native-gesture-handler 内部的可选依赖回退链
  // 在静态解析缺失包时会触发 Module not found 构建警告（运行时本就静默兜底）。
  // 将缺省包指向实际会使用的实现，仅消除警告、不改变运行时行为。
  config.resolve.alias = {
    ...config.resolve.alias,
    // paper 图标加载链的首选分支 → 其自身回退实现（即 @expo/vector-icons）
    '@react-native-vector-icons/material-design-icons':
      '@expo/vector-icons/MaterialCommunityIcons',
    // 同上（静态分析仍会扫描该不可达 require，一并指向以消除告警）
    'react-native-vector-icons/MaterialCommunityIcons':
      '@expo/vector-icons/MaterialCommunityIcons',
    // gesture-handler 探测 reanimated 后有 useSharedValue 校验，
    // 空模块（{}）会被重置回 undefined，与未安装时行为一致
    'react-native-reanimated': false,
  };

  // Tauri 插件仅在桌面端运行时可用，web 构建无需解析。
  config.externals = {
    ...config.externals,
    '@tauri-apps/plugin-dialog': 'commonjs @tauri-apps/plugin-dialog',
    '@tauri-apps/plugin-fs': 'commonjs @tauri-apps/plugin-fs',
  };

  // 体积告警阈值放宽：数据 JSON（离线词库/真题）已拆成按需加载的独立 chunk，
  // 但单文件仍可达数 MB（worddict.json ~4.9MB），属预期体积而非回归；
  // Tauri 离线包走本地协议，文件大小无网络成本。默认 244KiB/586KiB 会每次误报。
  config.performance = {
    ...config.performance,
    maxAssetSize: 6 * 1024 * 1024, // 单个资源 6MB（兜住最大的 worddict chunk）
    maxEntrypointSize: 3 * 1024 * 1024, // 入口包 3MB（拆分后 main.js 约 1~1.5MB）
  };

  return config;
};
