const path = require('path');
const { TsConfigPathsPlugin } = require('awesome-typescript-loader');

module.exports = {
  entry: './src/com/atomgraph/platform/client/Map.ts',
  mode: 'development',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        loader: 'awesome-typescript-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
    plugins: [
      new TsConfigPathsPlugin()
    ]
  },
  output: {
    library: ["SPARQLMap"],
    libraryTarget: "window",
    filename: 'SPARQLMap.js',
    path: path.resolve(__dirname, 'dist')
  }
};