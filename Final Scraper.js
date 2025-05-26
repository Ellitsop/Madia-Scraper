// ==UserScript==
// @name         Universal Media Downloader
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Attempts to find and download media (video, audio, images, etc.) from webpages with a user-friendly UI.
// @author       Your Name
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const SCRIPT_PREFIX = 'umd_'; // Prevents CSS/ID clashes

    // --- UI Elements ---
    let panelContainer, openButton, mediaListContainer;
    let isPanelOpen = false;

    // --- Data Storage ---
    let foundMedia = {
        video: [],
        audio: [],
        image: [],
        other: []
    };

    // --- Helper Functions ---

    function getFileExtension(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const lastDot = pathname.lastIndexOf('.');
            if (lastDot === -1 || lastDot === pathname.length - 1) {
                return 'unknown';
            }
            return pathname.substring(lastDot + 1).toLowerCase();
        } catch (e) {
            return 'unknown';
        }
    }

    async function getFileSize(url) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "HEAD",
                url: url,
                onload: function(response) {
                    const sizeHeader = response.responseHeaders.match(/^content-length:\s*(\d+)/im);
                    if (sizeHeader && sizeHeader[1]) {
                        resolve(parseInt(sizeHeader[1], 10));
                    } else {
                        resolve(null); // Size unknown
                    }
                },
                onerror: function() {
                    resolve(null);
                },
                onabort: function() {
                    resolve(null);
                },
                ontimeout: function() {
                    resolve(null);
                }
            });
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function sanitizeFilename(name) {
        // Basic sanitization, can be expanded
        return name.replace(/[<>:"/\\|?*]+/g, '_').substring(0, 100);
    }

    function getFileNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const segments = pathname.split('/');
            let filename = segments.pop() || 'download';
            // Remove query parameters from filename if present
            filename = filename.split('?')[0];
            // If no extension, try to get it from the original URL
            if (!filename.includes('.')) {
                const ext = getFileExtension(url);
                if (ext !== 'unknown') {
                    filename += '.' + ext;
                }
            }
            return sanitizeFilename(decodeURIComponent(filename));
        } catch (e) {
            return 'download.' + getFileExtension(url);
        }
    }


    // --- Media Discovery Functions ---

    function findMediaOnPage() {
        foundMedia = { video: [], audio: [], image: [], other: [] }; // Reset

        // 1. Videos
        document.querySelectorAll('video, video > source, a[href*=".mp4"], a[href*=".webm"], a[href*=".ogg"], a[href*=".m3u8"]').forEach(async el => {
            let src = el.src || el.href;
            if (src && !foundMedia.video.some(item => item.url === src)) {
                if (src.startsWith('blob:')) {
                    console.warn("UMD: Blob video URLs are complex to download directly via simple link and often require advanced interception. This script may not handle them well.");
                    // Potentially try to find the original source if it's in a data attribute or nearby script
                }
                const fileType = getFileExtension(src);
                const name = el.title || el.alt || getFileNameFromUrl(src);
                const size = await getFileSize(src);
                foundMedia.video.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // 2. Audios
        document.querySelectorAll('audio, audio > source, a[href*=".mp3"], a[href*=".wav"], a[href*=".aac"], a[href*=".flac"]').forEach(async el => {
            let src = el.src || el.href;
            if (src && !foundMedia.audio.some(item => item.url === src)) {
                 if (src.startsWith('blob:')) {
                    console.warn("UMD: Blob audio URLs are complex to download directly.");
                }
                const fileType = getFileExtension(src);
                const name = el.title || getFileNameFromUrl(src);
                const size = await getFileSize(src);
                foundMedia.audio.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // 3. Images
        document.querySelectorAll('img, a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".gif"], a[href*=".bmp"], a[href*=".webp"], a[href*=".svg"]').forEach(async el => {
            let src = el.src || el.href;
            // Prioritize data-src or similar attributes for lazy-loaded images
            src = el.dataset.src || el.dataset.lazySrc || src;
            if (src && !foundMedia.image.some(item => item.url === src)) {
                // Convert relative URLs to absolute
                if (src.startsWith('/') && !src.startsWith('//')) {
                    src = window.location.origin + src;
                } else if (src.startsWith('//')) {
                    src = window.location.protocol + src;
                } else if (!src.startsWith('http')) {
                    // Could be a relative path from the current page's directory
                    try {
                        src = new URL(src, window.location.href).href;
                    } catch (e) { /* ignore if invalid */ }
                }

                const fileType = getFileExtension(src);
                const name = el.alt || el.title || getFileNameFromUrl(src);
                const size = await getFileSize(src);
                foundMedia.image.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // 4. Other (fonts, subtitles, html for iframes/embeds)
        // This is more complex and site-specific. Basic examples:
        // For fonts (often found in CSS or <link> tags for preloading)
        // This requires parsing CSS, which is hard. A simpler approach is direct links:
        document.querySelectorAll('a[href*=".otf"], a[href*=".ttf"], a[href*=".woff"], a[href*=".woff2"]').forEach(async el => {
            let src = el.href;
            if (src && !foundMedia.other.some(item => item.url === src)) {
                const fileType = getFileExtension(src);
                const name = getFileNameFromUrl(src);
                const size = await getFileSize(src);
                foundMedia.other.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // For subtitles (common extensions)
        document.querySelectorAll('track[src], a[href*=".vtt"], a[href*=".srt"]').forEach(async el => {
            let src = el.src || el.href;
            if (src && !foundMedia.other.some(item => item.url === src)) {
                const fileType = getFileExtension(src);
                const name = el.label || getFileNameFromUrl(src);
                const size = await getFileSize(src);
                foundMedia.other.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // For embedded documents (iframes, embeds) - just listing the source URL
        document.querySelectorAll('iframe[src], embed[src]').forEach(async el => {
            let src = el.src;
            if (src && !foundMedia.other.some(item => item.url === src) && !src.startsWith('javascript:')) {
                const fileType = 'html_embed'; // Or try to infer
                const name = el.title || getFileNameFromUrl(src);
                const size = await getFileSize(src); // Size of the HTML doc itself
                foundMedia.other.push({ url: src, name: name, type: fileType, size: size, detectedTime: Date.now() });
            }
        });

        // After a delay to allow async operations to potentially complete
        setTimeout(renderMediaList, 1500); // Adjust delay as needed
    }


    // --- UI Rendering ---
    function createPanel() {
        // Open Button
        openButton = document.createElement('div');
        openButton.id = SCRIPT_PREFIX + 'open_button';
        openButton.textContent = '📥'; // Download icon or similar
        openButton.addEventListener('click', togglePanel);
        document.body.appendChild(openButton);

        // Panel Container (Drawer)
        panelContainer = document.createElement('div');
        panelContainer.id = SCRIPT_PREFIX + 'panel';
        panelContainer.innerHTML = `
            <div class="${SCRIPT_PREFIX}panel_header">
                <h3>Media Downloader</h3>
                <button id="${SCRIPT_PREFIX}refresh_button">🔄 Refresh</button>
                <button id="${SCRIPT_PREFIX}close_button">✕</button>
            </div>
            <div id="${SCRIPT_PREFIX}media_list_container">
                <p>Click "Refresh" to scan for media.</p>
            </div>
        `;
        document.body.appendChild(panelContainer);

        // Event Listeners for panel buttons
        document.getElementById(SCRIPT_PREFIX + 'close_button').addEventListener('click', togglePanel);
        document.getElementById(SCRIPT_PREFIX + 'refresh_button').addEventListener('click', () => {
            mediaListContainer.innerHTML = '<p>Scanning for media... please wait.</p>';
            findMediaOnPage();
        });

        mediaListContainer = document.getElementById(SCRIPT_PREFIX + 'media_list_container');
    }

    function renderMediaList() {
        mediaListContainer.innerHTML = ''; // Clear previous list

        const categoriesOrder = ['video', 'audio', 'image', 'other'];

        categoriesOrder.forEach(categoryKey => {
            const items = foundMedia[categoryKey];
            if (items.length > 0) {
                // Sort by detectedTime (newer first) - this is a proxy for "newness"
                // More robust newness detection is very hard without server-side info
                items.sort((a, b) => (b.detectedTime || 0) - (a.detectedTime || 0)); // Descending for newer first

                const categoryTitle = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
                const categoryDiv = document.createElement('div');
                categoryDiv.className = SCRIPT_PREFIX + 'category_section';
                categoryDiv.innerHTML = `<h4>${categoryTitle} (${items.length})</h4>`;
                const ul = document.createElement('ul');

                items.forEach(item => {
                    const li = document.createElement('li');
                    li.className = SCRIPT_PREFIX + 'media_item';

                    // Sanitize URL before displaying to prevent XSS if URL itself is malicious (unlikely here but good practice)
                    const safeUrl = encodeURI(item.url);
                    const displayName = item.name || 'Unknown File';
                    const displayType = item.type.toUpperCase();
                    const displaySize = item.size ? formatBytes(item.size) : 'N/A';

                    // Adding download attribute to suggest filename
                    const downloadFilename = getFileNameFromUrl(item.url);

                    li.innerHTML = `
                        <div class="${SCRIPT_PREFIX}item_info">
                            <span class="${SCRIPT_PREFIX}item_name" title="${displayName}">${displayName}</span>
                            <span class="${SCRIPT_PREFIX}item_meta">Type: ${displayType} | Size: ${displaySize}</span>
                        </div>
                        <div class="${SCRIPT_PREFIX}item_actions">
                            <button class="${SCRIPT_PREFIX}copy_link_button" data-url="${safeUrl}">Copy Link</button>
                            <a href="${safeUrl}" download="${downloadFilename}" target="_blank" class="${SCRIPT_PREFIX}download_button">Download</a>
                        </div>
                    `;
                    ul.appendChild(li);
                });
                categoryDiv.appendChild(ul);
                mediaListContainer.appendChild(categoryDiv);
            }
        });

        if (mediaListContainer.innerHTML === '') {
            mediaListContainer.innerHTML = '<p>No media found or supported on this page. Try refreshing if content loaded dynamically.</p>';
        }

        // Add event listeners for copy buttons
        document.querySelectorAll('.' + SCRIPT_PREFIX + 'copy_link_button').forEach(button => {
            button.addEventListener('click', function() {
                const urlToCopy = this.dataset.url;
                GM_setClipboard(decodeURI(urlToCopy)); // Decode for actual clipboard content
                this.textContent = 'Copied!';
                setTimeout(() => { this.textContent = 'Copy Link'; }, 1500);
            });
        });
    }


    function togglePanel() {
        isPanelOpen = !isPanelOpen;
        panelContainer.style.right = isPanelOpen ? '0' : '-450px'; // Adjust width
        if (isPanelOpen && mediaListContainer.innerHTML.includes('scan for media')) {
            // Initial scan if panel is opened for the first time or after a refresh state
            mediaListContainer.innerHTML = '<p>Scanning for media... please wait.</p>';
            findMediaOnPage();
        }
    }


    // --- Styling (GM_addStyle) ---
    function addStyles() {
        GM_addStyle(`
            #${SCRIPT_PREFIX}open_button {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99998;
                background-color: #007bff;
                color: white;
                padding: 10px 15px;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-size: 20px;
                transition: background-color 0.3s ease;
            }
            #${SCRIPT_PREFIX}open_button:hover {
                background-color: #0056b3;
            }

            #${SCRIPT_PREFIX}panel {
                position: fixed;
                top: 0;
                right: -450px; /* Initially hidden, adjust width as needed */
                width: 430px; /* Panel width */
                height: 100%;
                background-color: #f8f9fa;
                border-left: 1px solid #dee2e6;
                box-shadow: -2px 0 15px rgba(0,0,0,0.1);
                z-index: 99999;
                transition: right 0.3s ease-in-out;
                display: flex;
                flex-direction: column;
                font-family: Arial, sans-serif;
            }

            .${SCRIPT_PREFIX}panel_header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                background-color: #e9ecef;
                border-bottom: 1px solid #ced4da;
            }
            .${SCRIPT_PREFIX}panel_header h3 {
                margin: 0;
                font-size: 18px;
                color: #343a40;
            }
            .${SCRIPT_PREFIX}panel_header button {
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                padding: 5px;
                color: #495057;
            }
             .${SCRIPT_PREFIX}panel_header button:hover {
                color: #000;
            }


            #${SCRIPT_PREFIX}media_list_container {
                padding: 15px;
                overflow-y: auto;
                flex-grow: 1; /* Takes remaining space */
            }
            #${SCRIPT_PREFIX}media_list_container p {
                color: #6c757d;
                text-align: center;
                margin-top: 20px;
            }

            .${SCRIPT_PREFIX}category_section {
                margin-bottom: 20px;
            }
            .${SCRIPT_PREFIX}category_section h4 {
                margin-top: 0;
                margin-bottom: 10px;
                font-size: 16px;
                color: #007bff;
                border-bottom: 1px solid #eee;
                padding-bottom: 5px;
            }
            .${SCRIPT_PREFIX}category_section ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .${SCRIPT_PREFIX}media_item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #e9ecef;
                font-size: 13px;
            }
            .${SCRIPT_PREFIX}media_item:last-child {
                border-bottom: none;
            }

            .${SCRIPT_PREFIX}item_info {
                flex-grow: 1;
                margin-right: 10px;
                overflow: hidden; /* For long names */
            }
            .${SCRIPT_PREFIX}item_name {
                display: block;
                font-weight: bold;
                color: #343a40;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .${SCRIPT_PREFIX}item_meta {
                display: block;
                font-size: 0.85em;
                color: #6c757d;
            }

            .${SCRIPT_PREFIX}item_actions button, .${SCRIPT_PREFIX}item_actions a {
                margin-left: 8px;
                padding: 5px 10px;
                border: 1px solid #007bff;
                background-color: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }
            .${SCRIPT_PREFIX}item_actions button:hover, .${SCRIPT_PREFIX}item_actions a:hover {
                background-color: #0056b3;
                border-color: #0056b3;
            }
            .${SCRIPT_PREFIX}copy_link_button {
                background-color: #6c757d;
                border-color: #6c757d;
            }
            .${SCRIPT_PREFIX}copy_link_button:hover {
                background-color: #5a6268;
                border-color: #545b62;
            }
        `);
    }

    // --- Initialization ---
    function init() {
        addStyles();
        createPanel();
        // Optional: Run initial scan on page load, or wait for user interaction
        // findMediaOnPage(); // Uncomment if you want to scan immediately (can be resource intensive)
        console.log("Universal Media Downloader initialized.");
    }

    // Wait for the DOM to be fully loaded before initializing
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();
