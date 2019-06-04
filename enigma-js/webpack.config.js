/* global __dirname, require, module*/

const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
const CreateFileWebpack = require('create-file-webpack')
const env = require('yargs').argv.env; // use --env with webpack 2
const pkg = require('./package.json');


let libraryName = pkg.name;

let outputFile, mode;

if (env === 'build') {
  mode = 'production';
  outputFile = libraryName + '.min.js';
  outputFileNode = libraryName + '.node.min.js';
} else {
  mode = 'development';
  outputFile = libraryName + '.js';
  outputFileNode = libraryName + '.node.js';
}

const config = {
  target: 'web',
  mode: mode,
  entry: [__dirname + '/src/index.js'],
  devtool: 'source-map',
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^any-promise$/, 'bluebird'),
  ],
  output: {
    path: __dirname + '/lib',
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  module: {
    rules: [
      {
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        exclude: /(node_modules|bower_components)/,
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    modules: [path.resolve('./node_modules'), path.resolve('./src')],
    extensions: ['.json', '.js'],
  },
};

const serverConfig = {
  target: 'async-node',
  mode: mode,
  entry:  [__dirname + '/src/index.js'],
  devtool: 'source-map',
  plugins: [
    new CreateFileWebpack({
      path: __dirname,
      fileName: 'node.js',
      content: `const {Enigma, utils, eeConstants} = require('./lib/${outputFileNode}');\nmodule.exports = {Enigma, utils, eeConstants};`,
    })
  ],
  output: {
    path: __dirname + '/lib',
    filename: outputFileNode,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  module: {
    rules: [
      {
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        exclude: /(node_modules|bower_components)/,
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: 'eslint-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: [nodeExternals()],
}

module.exports = [config, serverConfig];
