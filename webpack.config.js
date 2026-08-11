// webpack.config.js
// 为 Expo Web 构建添加 Node.js 核心模块的 polyfill 配置，
// 并将资源路径设置为相对路径，以便在 Tauri 中通过本地协议正确加载。

const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  // 获取 Expo 默认的 webpack 配置
  const config = await createExpoWebpackConfigAsync(env, argv);

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

  // Tauri 插件仅在桌面端运行时可用，web 构建无需解析。
  config.externals = {
    ...config.externals,
    '@tauri-apps/plugin-dialog': 'commonjs @tauri-apps/plugin-dialog',
    '@tauri-apps/plugin-fs': 'commonjs @tauri-apps/plugin-fs',
  };

  return config;
};
