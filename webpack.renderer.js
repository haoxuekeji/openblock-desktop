const path = require('path');
const fs = require('fs');

const CopyWebpackPlugin = require('copy-webpack-plugin');

const makeConfig = require('./webpack.makeConfig.js');

const getModulePath = moduleName => path.dirname(require.resolve(`${moduleName}/package.json`));

// Follow symlinks so babel `include` matches real worktree paths
// (resolve.symlinks is false in makeConfig).
const realPkgSrc = moduleName => {
    try {
        return path.join(fs.realpathSync(getModulePath(moduleName)), 'src');
    } catch (e) {
        return null;
    }
};

module.exports = defaultConfig =>
    makeConfig(
        defaultConfig,
        {
            name: 'renderer',
            useReact: true,
            disableDefaultRulesForExtensions: ['js', 'jsx', 'css', 'svg', 'png', 'wav', 'gif', 'jpg', 'ttf'],
            babelPaths: [
                path.resolve(__dirname, 'src', 'renderer'),
                realPkgSrc('openblock-gui'),
                realPkgSrc('openblock-vm'),
                realPkgSrc('hxblock-blocks'),
                realPkgSrc('hxblock-l10n'),
                /node_modules[\\/]+scratch-[^\\/]+[\\/]+src/,
                /node_modules[\\/]+openblock-[^\\/]+[\\/]+src/,
                /node_modules[\\/]+hxblock-[^\\/]+[\\/]+src/,
                /node_modules[\\/]+pify/,
                /node_modules[\\/]+@vernier[\\/]+godirect/
            ].filter(Boolean),
            plugins: [
                new CopyWebpackPlugin([{
                    from: path.join(getModulePath('hxblock-blocks'), 'media'),
                    to: 'static/blocks-media'
                }]),
                new CopyWebpackPlugin([{
                    from: 'extension-worker.{js,js.map}',
                    context: path.join(getModulePath('openblock-vm'), 'dist', 'web')
                }]),
                new CopyWebpackPlugin([{
                    from: path.join(getModulePath('openblock-gui'), 'src', 'lib', 'libraries', '*.json'),
                    to: 'static/libraries',
                    flatten: true
                }])
            ]
        }
    );
