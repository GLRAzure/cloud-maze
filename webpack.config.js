var BitBarWebpackProgressPlugin = require("bitbar-webpack-progress-plugin");
var path = require('path');

module.exports = {
  entry: './client/index-client.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'website')
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