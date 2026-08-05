#!/usr/bin/env node
/**
 * OB-031D: 桌面端本地多仓依赖（符号链接）脚本化。
 *
 * openblock-desktop 的本地开发/发布构建依赖本地兄弟仓库，而不是
 * registry / github 快照。此前这些 node_modules 符号链接为手工创建，
 * 本脚本把它们固化为可复现、可校验的流程：
 *
 *   node_modules/hxblock-blocks     -> ../openblock-blocks
 *   node_modules/hxblock-l10n      -> ../openblock-l10n
 *   node_modules/openblock-vm      -> ../openblock-vm
 *   node_modules/openblock-link    -> ../openblock-link
 *   node_modules/openblock-resource-> ../openblock-resource
 *   node_modules/openblock-gui     -> ../openblock-gui.worktrees/desktop
 *
 * 用法：
 *   node scripts/setup-local-deps.js          # 创建/修复符号链接
 *   node scripts/setup-local-deps.js --check  # 校验并报告各链接与源仓库状态
 *   OPENBLOCK_ROOT=/path/to/openblock         # 覆盖多仓根目录
 *
 * 注意：openblock-gui 指向 desktop worktree（desktop-haoxue 分支），
 * --check 会核对该 worktree 的当前分支。
 */
'use strict';

const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const DESKTOP_ROOT = path.resolve(__dirname, '..');
const OB_ROOT = path.resolve(process.env.OPENBLOCK_ROOT || path.join(DESKTOP_ROOT, '..'));
const CHECK_ONLY = process.argv.includes('--check');

const LINKS = [
    {pkg: 'hxblock-blocks', repo: 'openblock-blocks'},
    {pkg: 'hxblock-l10n', repo: 'openblock-l10n'},
    {pkg: 'openblock-vm', repo: 'openblock-vm'},
    {pkg: 'openblock-link', repo: 'openblock-link'},
    {pkg: 'openblock-resource', repo: 'openblock-resource'},
    {pkg: 'openblock-gui', repo: 'openblock-gui.worktrees/desktop', expectBranch: 'desktop-haoxue'}
];

const log = msg => process.stdout.write(`[desktop-local-deps] ${msg}\n`);
let failures = 0;
const fail = msg => {
    failures++;
    process.stderr.write(`[desktop-local-deps] ERROR: ${msg}\n`);
};

for (const {pkg, repo, expectBranch} of LINKS) {
    const target = path.join(OB_ROOT, repo);
    const linkPath = path.join(DESKTOP_ROOT, 'node_modules', pkg);

    if (!fs.existsSync(path.join(target, 'package.json'))) {
        fail(`本地仓库缺失: ${target}`);
        continue;
    }

    let head = 'unknown';
    let dirty = false;
    let branch = '';
    try {
        head = execFileSync('git', ['-C', target, 'rev-parse', 'HEAD']).toString().trim();
        dirty = execFileSync('git', ['-C', target, 'status', '--short']).toString().trim().length > 0;
        branch = execFileSync('git', ['-C', target, 'branch', '--show-current']).toString().trim();
    } catch (e) {
        fail(`读取 ${repo} git 状态失败: ${e.message}`);
    }
    if (expectBranch && branch !== expectBranch) {
        fail(`${repo} 当前分支为 ${branch || '(detached)'}，期望 ${expectBranch}`);
    }

    const state = `${repo}@${head.slice(0, 12)}${dirty ? '+dirty' : ''}${branch ? ` (${branch})` : ''}`;

    let linkOk = false;
    if (fs.existsSync(linkPath)) {
        const st = fs.lstatSync(linkPath);
        if (st.isSymbolicLink()) {
            linkOk = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)) === path.resolve(target);
        }
    }

    if (CHECK_ONLY) {
        if (linkOk) {
            log(`${pkg}: link-ok -> ${state}`);
        } else {
            fail(`${pkg}: 链接缺失或指向错误（应指向 ${target}）`);
        }
        continue;
    }

    if (!linkOk) {
        fs.rmSync(linkPath, {recursive: true, force: true});
        fs.mkdirSync(path.dirname(linkPath), {recursive: true});
        fs.symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, 'dir');
        log(`${pkg}: 已链接 -> ${state}`);
    } else {
        log(`${pkg}: 链接已就绪 -> ${state}`);
    }
}

if (failures > 0) {
    process.stderr.write(`[desktop-local-deps] ${failures} 个问题\n`);
    process.exit(1);
}
log('done');
