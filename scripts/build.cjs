const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'vk-copy-post');
fs.mkdirSync(target, { recursive: true });
for (const file of ['manifest.json', 'background.js', 'diagnostics.js', 'updates.js', 'content.js', 'parser.js', 'options.html', 'options.css', 'options.js', 'icon.png']) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
}
console.log(target);
