#!/usr/bin/env node
/**
 * Sync local external-resources-v3 into the desktop app's external-resources/
 * directory. Replaces the old "download from GitHub" fetch:exts flow so the
 * desktop package always ships the same MicroPython extensions as the web build.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(
    process.env.EXTERNAL_RESOURCES_SRC ||
    path.join(__dirname, '..', '..', 'external-resources-v3')
);
const DEST = path.resolve(__dirname, '..', 'external-resources');

const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, {recursive: true});
        fs.readdirSync(src).forEach(entry => {
            // Skip the bulky Arduino C/C++ libraries; desktop Link only needs
            // MicroPython .py files under lib/, plus the JS/SVG metadata.
            if (entry === 'node_modules' || entry === '.git') return;
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
};

if (!fs.existsSync(SRC)) {
    console.error(`Source not found: ${SRC}`);
    process.exit(1);
}

fs.rmSync(DEST, {recursive: true, force: true});
copyRecursive(SRC, DEST);
console.log(`Synced ${SRC} -> ${DEST}`);
