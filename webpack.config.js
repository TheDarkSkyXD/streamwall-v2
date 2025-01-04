const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

const baseConfig = ({ babel }) => ({
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: babel,
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.ttf$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
        },
      },
      {
        test: /\.svg$/,
        loader: '@svgr/webpack',
        options: {
          replaceAttrValues: {
            '#333': 'currentColor',
            '#555': '{props.color}',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.jsx', '.js'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
})

const nodeConfig = {
  ...baseConfig({
    babel: {
      presets: [
        [
          '@babel/preset-env',
          {
            modules: 'commonjs',
            targets: { node: true },
          },
        ],
      ],
    },
  }),
  target: 'electron-main',
  entry: {
    index: './src/node/index.js',
  },
  externals: {
    consolidate: 'commonjs consolidate',
    fsevents: 'commonjs fsevents',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
  }
}

const browserConfig = {
  ...baseConfig({
    babel: {
      presets: [['@babel/preset-env', { targets: { electron: '11' } }]],
    },
  }),
  devtool: 'cheap-source-map',
  target: 'electron-renderer',
  entry: {
    background: './src/browser/background.js',
    overlay: './src/browser/overlay.js',
    layerPreload: './src/browser/layerPreload.js',
    mediaPreload: './src/browser/mediaPreload.js',
    playHLS: './src/browser/playHLS.js',
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'src/browser/*.html', to: '[name].html' }],
    }),
  ],
  output: {
    path: path.resolve(__dirname, 'dist'),
  }
}

const devServer = {
  static: {
    directory: path.join(__dirname, 'dist'),
  },
  port: 3001,
  hot: true,
  compress: true,
  devMiddleware: {
    writeToDisk: true
  },
  open: false,
  client: {
    webSocketURL: 'auto://0.0.0.0:0/ws'
  }
}

const webConfig = {
  ...baseConfig({
    babel: {
      presets: [
        [
          '@babel/preset-env',
          {
            modules: 'commonjs',
            targets: '> 0.25%, not dead',
          },
        ],
      ],
    },
  }),
  devtool: 'cheap-source-map',
  target: 'web',
  entry: {
    app: './src/web/App.js',
  },
  devServer,
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/',
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'src/web/*.ejs', to: '[name].ejs' }],
    }),
  ],
}

module.exports = [nodeConfig, browserConfig, webConfig]
