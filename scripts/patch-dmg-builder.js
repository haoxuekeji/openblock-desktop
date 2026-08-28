/**
 * dmg-builder 22 vendor 的 dmgbuild/core.py 顶部有 python2 专有的
 * reload(sys)/sys.setdefaultencoding hack，在 python3 下抛
 * NameError: name 'reload' is not defined。现代 macOS 已移除 python2，
 * CI 通过 PYTHON_PATH=/usr/bin/python3 调用，故将这两行条件化。
 * vendor 其余代码均为 py2/py3 双兼容写法，无需处理。
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
    __dirname, '..', 'node_modules', 'dmg-builder', 'vendor', 'dmgbuild', 'core.py'
);

const PY2_HACK = "reload(sys)  # Reload is a hack\nsys.setdefaultencoding('UTF8')";
const PY23_SAFE = [
    'if sys.version_info < (3,):',
    '    reload(sys)  # Reload is a hack',
    "    sys.setdefaultencoding('UTF8')"
].join('\n');

if (!fs.existsSync(target)) {
    console.log('[patch-dmg-builder] core.py not found (non-mac install layout?), skip');
    process.exit(0);
}

const src = fs.readFileSync(target, 'utf8');
if (src.includes(PY2_HACK)) {
    fs.writeFileSync(target, src.replace(PY2_HACK, PY23_SAFE));
    console.log('[patch-dmg-builder] core.py patched for python3');
} else if (src.includes('sys.version_info < (3,)')) {
    console.log('[patch-dmg-builder] already patched');
} else {
    console.log('[patch-dmg-builder] pattern not found; dmg-builder layout changed, please review');
}
