var BitBarWebpackProgressPlugin = require("bitbar-webpack-progress-plugin");
var path = require('path');

module.exports = {
  entry: {
      client: './client/index-client.js',
      overwatch: './client/index-overwatch.js'
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'website'),
    chunkFilename: "[id].chunk.js"
  },
  plugins: [
    new BitBarWebpackProgressPlugin()
  ],
  resolve: {
    alias: {
        'vue$': 'vue/dist/vue.common.js'
    }
  }
};