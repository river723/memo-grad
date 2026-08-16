module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 把 worklets 拆成独立包，babel 插件也迁移到 react-native-worklets
      'react-native-worklets/plugin'
    ],
  };
};