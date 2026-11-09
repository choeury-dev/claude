// 저장소 루트의 src/ (1단계에서 만든 분류 엔진)를 앱에서 그대로 import 하기 위한 설정
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../src')];

module.exports = config;
