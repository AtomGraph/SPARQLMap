const path = require('path');

module.exports = {
  entry: './src/com/atomgraph/platform/client/Map.ts',
  mode: 'development',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.ts', '.js' ]
  },
  output: {
    library: ["SPARQLMap"],
    libraryTarget: "window",
    filename: 'SPARQLMap.js',
    path: path.resolve(__dirname, 'dist')
  }
};