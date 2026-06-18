import { babelConfig, rootResolve, isFunction, isObject, log, resolve, originalRequire } from './utils';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import webpack from 'webpack';

const dirCwd = process.cwd();
let plugins = [];

export default (opts: Record<string, any> = {}): any => {
  const pkgPath = path.join(dirCwd, 'package.json');
  const rawPackageJson = fs.readFileSync(pkgPath) as unknown as string;
  const pkg = JSON.parse(rawPackageJson);
  const { args, cmdOpts = {} } = opts;
  const { htmlWebpack = {} } = args;
  const name = pkg.name;
  const isProd = opts.production;
  const banner = `/*! ${name} - ${pkg.version} */`;

  if (!isProd) {
    const fname = 'index.html';
    const index = `${dirCwd}/${fname}`;
    const indexDev = `${dirCwd}/_${fname}`;
    let template = path.resolve(__dirname, `./../${fname}`);

    if (fs.existsSync(indexDev)) {
      template = indexDev;
    } else if (fs.existsSync(index)) {
      template = index;
    }

    plugins.push(
      new HtmlWebpackPlugin({
        inject: 'head',
        template,
        ...htmlWebpack,
        templateParameters: {
          name,
          title: name,
          gjsVersion: 'latest',
          pathGjs: '',
          pathGjsCss: '',
          ...(htmlWebpack.templateParameters || {}),
        },
      }),
    );
  }

  const outPath = path.resolve(dirCwd, args.output);
  const modulesPaths = ['node_modules', path.join(__dirname, '../node_modules')];

  let config = {
    entry: path.resolve(dirCwd, args.entry),
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? 'source-map' : 'eval',
    optimization: {
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            compress: {
              evaluate: false, // Avoid breaking gjs scripts
            },
            output: {
              comments: false,
              quote_style: 3, // Preserve original quotes
              preamble: banner, // banner here instead of BannerPlugin
            },
          },
        }),
      ],
    },
    output: {
      path: outPath,
      filename: 'index.js',
      library: name,
      libraryTarget: 'umd',
      globalObject: `typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this)`,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: resolve('ts-loader'),
          exclude: /node_modules/,
          options: {
            context: rootResolve(''),
            configFile: rootResolve('tsconfig.json'),
            // Only type-check files actually reached from the bundle entry, not
            // the whole tsconfig program (which `include`s `test/`). A library
            // build shouldn't fail on its test suite — and it keeps the build
            // resilient when test-only types (e.g. @types/jest) aren't installed.
            onlyCompileBundledFiles: true,
          },
        },
        {
          test: /\.js$/,
          loader: resolve('babel-loader'),
          include: /src/,
          options: {
            ...babelConfig(args),
            cacheDirectory: true,
            ...args.babel,
          },
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      modules: modulesPaths,
    },
    plugins,
  };

  // Try to load local webpack config
  const localWebpackPath = rootResolve('webpack.config.js');
  let localWebpackConf: any;

  if (fs.existsSync(localWebpackPath)) {
    const customWebpack = originalRequire()(localWebpackPath);
    localWebpackConf = customWebpack.default || customWebpack;
  }

  if (isFunction(localWebpackConf)) {
    const fnRes = localWebpackConf({ config, webpack, pkg });
    config = isObject(fnRes) ? fnRes : config;
  }

  cmdOpts.verbose && log(chalk.yellow('Webpack config:\n'), config, '\n');

  return config;
};
