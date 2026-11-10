/* build.js — 把 styles.css / components.js / custom.js / app.js 内联进 index.html，
 * 生成可直接发送、双击即用的单文件 circuitsim-standalone.html。
 * 用法：node build.js  （修改源码后重新运行即可重新生成）
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
const js1 = fs.readFileSync(path.join(dir, 'components.js'), 'utf8');
const js2 = fs.readFileSync(path.join(dir, 'custom.js'), 'utf8');
const js3 = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

html = html.replace('<link rel="stylesheet" href="styles.css" />', '<style>\n' + css + '\n</style>');
html = html.replace('<script src="components.js"></script>', '<script>\n' + js1 + '\n</script>');
html = html.replace('<script src="custom.js"></script>', '<script>\n' + js2 + '\n</script>');
html = html.replace('<script src="app.js"></script>', '<script>\n' + js3 + '\n</script>');

fs.writeFileSync(path.join(dir, 'circuitsim-standalone.html'), html);
console.log('✓ built circuitsim-standalone.html  (' + (html.length / 1024).toFixed(1) + ' KB)');
