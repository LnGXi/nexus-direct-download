// ==UserScript==
// @name         Nexus Mods 文件直下
// @namespace    local.nexusmods.direct-download
// @version      1.0.1
// @description  进入具体文件的下载页后直接索取下载链接，跳过前端五秒倒计时。
// @match        https://www.nexusmods.com/*/mods/*
// @match        https://nexusmods.com/*/mods/*
// @run-at       document-idle
// @grant        none
// @noframes
// @author       LnGXi
// @homepageURL  https://github.com/LnGXi/nexus-direct-download
// @supportURL   https://github.com/LnGXi/nexus-direct-download/issues
// @updateURL    https://raw.githubusercontent.com/LnGXi/nexus-direct-download/main/nexus-direct-download.user.js
// @downloadURL  https://raw.githubusercontent.com/LnGXi/nexus-direct-download/main/nexus-direct-download.user.js
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const attempts = new Map();
    let panel;
    let message;
    let directLink;
    let retryButton;
    let currentContext;

    function positiveId(value) {
        const text = String(value ?? '');
        return /^[1-9]\d*$/.test(text) ? text : null;
    }

    // 新版下载组件会把文件信息和按钮放入开放的 Shadow DOM。
    function downloadComponents(root = document) {
        const result = [];
        for (const host of root.querySelectorAll('mod-file-download, mod-download-buttons, mod-download-modal')) {
            result.push(host);
            if (host.shadowRoot) result.push(...downloadComponents(host.shadowRoot));
        }
        return result;
    }

    function readContext() {
        const page = new URL(location.href);
        const mod = page.pathname.match(/^\/([^/]+)\/mods\/(\d+)(?:\/|$)/);
        if (!mod) return null;
        const fileId = positiveId(page.searchParams.get('file_id')) ||
            positiveId(page.pathname.match(/\/files\/(\d+)\/?$/)?.[1]);
        if (!fileId || page.searchParams.get('tab') === 'requirements') return null;

        const hosts = downloadComponents();
        let selectedFile = null;
        let selectedHost = null;
        for (const host of hosts) {
            try {
                const file = JSON.parse(host.getAttribute('file') || host.getAttribute('main-file') || 'null');
                if (positiveId(file?.id ?? file?.fileId) === fileId) {
                    selectedHost = host;
                    selectedFile = file;
                    break;
                }
            } catch {
                // 组件属性尚未完成加载，下次检查时再读取。
            }
        }
        const standalone = hosts.find(host => host.localName === 'mod-file-download');
        const legacyButton = document.querySelector('#slowDownloadButton, #slowDownload, #dl_link');
        if (!selectedHost && !standalone && !legacyButton) return null;

        const gameId = positiveId(selectedHost?.getAttribute('game-id')) ||
            positiveId(standalone?.getAttribute('game-id')) ||
            positiveId(document.querySelector('#section')?.getAttribute('data-game-id'));
        const manager = page.searchParams.get('nmm') === '1';
        const key = [mod[1], mod[2], fileId, manager].join('/');
        return { key, page: page.href, fileId, gameId, manager, game: mod[1], modId: mod[2], file: selectedFile };
    }

    function downloadAddress(value, context) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const address = new URL(value.replace(/&amp;/g, '&'), location.origin);
            if (context.manager) {
                if (address.protocol !== 'nxm:' || address.hostname.toLowerCase() !== context.game.toLowerCase()) return null;
                if (address.pathname !== '/mods/' + context.modId + '/files/' + context.fileId) return null;
                if (!['key', 'expires', 'user_id'].every(name => address.searchParams.get(name))) return null;
                return address.href;
            }
            if (address.protocol !== 'https:') return null;
            if (/(^|\.)nexus-cdn\.com$/i.test(address.hostname)) return address.href;
            if (/(^|\.)nexusmods\.com$/i.test(address.hostname) &&
                (/^\/(?:api\/files|cdn|files)\//.test(address.pathname) ||
                 (address.searchParams.has('expires') && address.searchParams.has('user_id')))) {
                return address.href;
            }
        } catch {
            return null;
        }
        return null;
    }

    function addressFromResponse(text, context) {
        try {
            const data = JSON.parse(text);
            const candidates = context.manager
                ? [data.vortexDownloadUrl, data.nmmDownloadUrl, data.url, data.downloadUrl, data.data?.url]
                : [data.downloadUrl, data.url, data.data?.url];
            for (const candidate of candidates) {
                const address = downloadAddress(candidate, context);
                if (address) return address;
            }
        } catch {
            // 某些旧版响应直接给出包含下载地址的 HTML。
        }
        const html = new DOMParser().parseFromString(text, 'text/html');
        const input = html.querySelector('#dl_link');
        return downloadAddress(input?.getAttribute('value') || input?.getAttribute('href'), context);
    }

    function showStatus(text, context, address = null, allowRetry = false) {
        currentContext = context;
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'nexus-direct-download-status';
            panel.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;max-width:360px;';
            const root = panel.attachShadow({ mode: 'open' });
            const box = document.createElement('div');
            box.style.cssText = 'background:#202024;color:#fff;padding:14px;border:1px solid #da8e35;border-radius:8px;font:14px/1.6 sans-serif;box-shadow:0 4px 18px #0006;';
            message = document.createElement('div');
            message.setAttribute('role', 'status');
            directLink = document.createElement('a');
            directLink.textContent = '点击这里启动下载';
            directLink.style.cssText = 'display:block;color:#ffc574;margin-top:8px;';
            directLink.referrerPolicy = 'no-referrer';
            retryButton = document.createElement('button');
            retryButton.textContent = '重新索取链接';
            retryButton.style.cssText = 'margin-top:8px;cursor:pointer;padding:4px 8px;';
            retryButton.addEventListener('click', () => {
                const fresh = readContext();
                if (fresh?.key === currentContext?.key) startDownload(fresh, true);
            });
            box.append(message, directLink, retryButton);
            root.append(box);
            document.body.append(panel);
        }
        panel.hidden = false;
        message.textContent = text;
        directLink.style.display = address ? 'block' : 'none';
        if (address) directLink.href = address;
        else directLink.removeAttribute('href');
        retryButton.hidden = !allowRetry;
    }

    async function requestAddress(context) {
        const embedded = context.manager
            ? context.file?.vortexDownloadUrl || context.file?.nmmDownloadUrl
            : context.file?.downloadUrl;
        const readyAddress = downloadAddress(embedded, context);
        let apiEndpoint = null;
        try {
            const candidate = new URL(embedded, location.origin);
            if (candidate.origin === location.origin && candidate.pathname.startsWith('/api/files/')) {
                if (context.manager) candidate.searchParams.set('nmm', '1');
                apiEndpoint = candidate.href;
            }
        } catch {
            // 下载地址为空时使用旧版生成接口。
        }
        if (readyAddress && !apiEndpoint) return readyAddress;
        if (!apiEndpoint && !context.gameId) throw new Error('尚未读到游戏编号，请稍后点击重新索取链接。');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const body = new URLSearchParams({ fid: context.fileId, game_id: context.gameId });
            if (context.manager) body.set('nmm', '1');
            const response = await fetch(apiEndpoint || '/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl', {
                method: apiEndpoint ? 'GET' : 'POST',
                redirect: 'manual',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: apiEndpoint ? undefined : body.toString(),
                signal: controller.signal
            });
            // API 若直接重定向到文件，交由浏览器接收，避免把大文件读入脚本内存。
            if (apiEndpoint && response.type === 'opaqueredirect') return apiEndpoint;
            if (response.status === 429) throw new Error('Nexus 暂时限制了请求频率，请稍后重试。');
            if (response.status === 401) throw new Error('请先登录 Nexus Mods，然后刷新页面。');
            if (response.status === 403 || response.headers.get('cf-mitigated') === 'challenge') {
                throw new Error('请求被拒绝，请在页面中完成验证并确认已登录，再重试。');
            }
            if (!response.ok) throw new Error('下载接口返回 HTTP ' + response.status + '，请稍后重试。');
            const address = addressFromResponse(await response.text(), context);
            if (!address) throw new Error('接口未返回可用的下载地址，请确认登录状态或使用页面原下载按钮。');
            return address;
        } finally {
            clearTimeout(timer);
        }
    }

    async function startDownload(context, retry = false) {
        const state = attempts.get(context.key);
        if (state === 'pending' || (state && !retry)) return;
        attempts.set(context.key, 'pending');
        showStatus('正在向 Nexus 索取文件链接…', context);
        try {
            const address = await requestAddress(context);
            // 等待接口期间切换了文件时，丢弃旧请求的结果。
            if (readContext()?.key !== context.key) {
                attempts.delete(context.key);
                return;
            }
            attempts.set(context.key, 'sent');
            showStatus('已交给浏览器处理。如下载未启动，可点击下面的链接。', context, address);
            location.assign(address);
        } catch (error) {
            attempts.set(context.key, 'failed');
            if (readContext()?.key !== context.key) return;
            const text = error.name === 'AbortError' ? '索取链接超时，请稍后重试。' : error.message;
            showStatus(text, context, null, true);
            console.warn('[Nexus 文件直下]', text);
        }
    }

    function checkPage() {
        const context = readContext();
        if (!context) {
            if (panel) panel.hidden = true;
            return;
        }
        // 等待组件提供编号或签名地址后才发出请求。
        if (!context.gameId && !context.file?.downloadUrl && !context.file?.vortexDownloadUrl && !context.file?.nmmDownloadUrl) return;
        if (currentContext && currentContext.key !== context.key && panel) panel.hidden = true;
        startDownload(context);
    }

    // 防止请求进行中点击原 Slow download 又启动第二份倒计时下载。
    window.addEventListener('click', event => {
        const context = readContext();
        if (!context || !['pending', 'sent'].includes(attempts.get(context.key))) return;
        const button = event.composedPath().find(node => node?.matches?.('button, a'));
        if (button?.id === 'slowDownloadButton' || /slow download/i.test(button?.textContent || '')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    checkPage();
    setInterval(checkPage, 1000);
})();
