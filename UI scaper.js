// ==UserScript==
// @name         Universal Media Downloader UI
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Attempts to find and download media (images, videos, audio) from web pages with a user interface. Not guaranteed to work on all sites.
// @author       Your AI Assistant
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- STYLES ---
    GM_addStyle(`
        #umd-panel-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #007bff;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            z-index: 99998;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #umd-panel-button:hover {
            background-color: #0056b3;
        }
        #umd-media-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 600px;
            max-height: 70vh;
            background-color: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 99999;
            display: none; /* Hidden by default */
            flex-direction: column;
            font-family: Arial, sans-serif;
        }
        #umd-panel-header {
            padding: 10px 15px;
            background-color: #f1f1f1;
            border-bottom: 1px solid #ccc;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #umd-panel-header h3 {
            margin: 0;
            font-size: 16px;
            color: #333;
        }
        #umd-panel-close-btn, #umd-panel-refresh-btn {
            background: #ddd;
            border: 1px solid #bbb;
            color: #333;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            margin-left: 10px;
        }
        #umd-panel-close-btn:hover, #umd-panel-refresh-btn:hover {
            background: #ccc;
        }
        #umd-media-list-container {
            overflow-y: auto;
            padding: 15px;
            flex-grow: 1;
        }
        .umd-media-category {
            margin-bottom: 20px;
        }
        .umd-media-category h4 {
            margin-top: 0;
            margin-bottom: 10px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
            font-size: 15px;
            color: #555;
        }
        .umd-media-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .umd-media-item:last-child {
            border-bottom: none;
        }
        .umd-media-preview {
            width: 60px;
            height: 40px;
            object-fit: cover;
            margin-right: 10px;
            border: 1px solid #ddd;
            background-color: #eee;
        }
        .umd-media-info {
            flex-grow: 1;
            font-size: 13px;
            word-break: break-all;
        }
        .umd-media-info .umd-media-name {
            font-weight: bold;
            color: #333;
        }
        .umd-media-info .umd-media-url {
            color: #777;
            font-size: 11px;
            margin-top: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 350px; /* Adjust as needed */
        }
        .umd-download-btn {
            padding: 6px 12px;
            background-color: #28a745;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-left: 10px;
        }
        .umd-download-btn:hover {
            background-color: #218838;
        }
        .umd-no-media {
            color: #777;
            font-style: italic;
        }
    `);

    // --- UI ELEMENTS ---
    const panelButton = document.createElement('button');
    panelButton.id = 'umd-panel-button';
    panelButton.textContent = '🖼️ Media Downloader';
    document.body.appendChild(panelButton);

    const mediaPanel = document.createElement('div');
    mediaPanel.id = 'umd-media-panel';
    mediaPanel.innerHTML = `
        <div id="umd-panel-header">
            <h3>Detected Media</h3>
            <div>
                <button id="umd-panel-refresh-btn" title="Refresh Media List">🔄 Refresh</button>
                <button id="umd-panel-close-btn" title="Close Panel">✖</button>
            </div>
        </div>
        <div id="umd-media-list-container">
            <p class="umd-no-media">Click "Refresh" to scan for media.</p>
        </div>
    `;
    document.body.appendChild(mediaPanel);

    const panelHeader = mediaPanel.querySelector('#umd-panel-header');
    const closeButton = mediaPanel.querySelector('#umd-panel-close-btn');
    const refreshButton = mediaPanel.querySelector('#umd-panel-refresh-btn');
    const mediaListContainer = mediaPanel.querySelector('#umd-media-list-container');

    // --- DRAGGABLE PANEL ---
    let offsetX, offsetY, isDragging = false;
    panelHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return; // Don't drag if clicking a button in header
        isDragging = true;
        offsetX = e.clientX - mediaPanel.offsetLeft;
        offsetY = e.clientY - mediaPanel.offsetTop;
        mediaPanel.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        mediaPanel.style.left = `${e.clientX - offsetX}px`;
        mediaPanel.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            mediaPanel.style.cursor = 'move';
        }
    });

    // --- CORE LOGIC ---
    panelButton.addEventListener('click', () => {
        if (mediaPanel.style.display === 'none' || mediaPanel.style.display === '') {
            mediaPanel.style.display = 'flex';
            scanMedia();
        } else {
            mediaPanel.style.display = 'none';
        }
    });

    closeButton.addEventListener('click', () => {
        mediaPanel.style.display = 'none';
    });

    refreshButton.addEventListener('click', scanMedia);

    function getAbsoluteUrl(url) {
        if (url.startsWith('//')) {
            return window.location.protocol + url;
        }
        const a = document.createElement('a');
        a.href = url;
        return a.href;
    }

    function getFilenameFromUrl(url) {
        try {
            const parsedUrl = new URL(url);
            let pathname = parsedUrl.pathname;
            // Remove trailing slash if it's the only thing after the last segment
            if (pathname.endsWith('/') && pathname.length > 1) {
                pathname = pathname.substring(0, pathname.length - 1);
            }
            let filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            // If no filename, try to get it from search params (less common for direct media)
            if (!filename && parsedUrl.search) {
                const searchParams = new URLSearchParams(parsedUrl.search);
                // Look for common parameters that might contain a filename
                for (const p of ['file', 'filename', 'name', 'title']) {
                    if (searchParams.has(p)) {
                        filename = searchParams.get(p);
                        break;
                    }
                }
            }
            // Decode URI components and remove problematic characters
            if (filename) {
                filename = decodeURIComponent(filename).replace(/[<>:"/\\|?*]+/g, '_');
            }
            // If still no filename, use a generic one based on hostname
            return filename || `${parsedUrl.hostname}_media_${Date.now()}`;
        } catch (e) {
            // Fallback for invalid URLs
            const parts = url.split('/');
            const lastPart = parts.pop() || parts.pop(); // handle trailing slash
            return (lastPart || `unknown_media_${Date.now()}`).replace(/[<>:"/\\|?*]+/g, '_');
        }
    }


    function createMediaItemElement(mediaType, url, namePrefix = '') {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'umd-media-item';

        let previewSrc = '';
        if (mediaType === 'image') {
            previewSrc = url;
        } else if (mediaType === 'video') {
            previewSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23888"%3E%3Cpath d="M4 6.47V17.53c0 1.04.85 1.89 1.89 1.89h12.21c1.04 0 1.89-.85 1.89-1.89V6.47c0-1.04-.85-1.89-1.89-1.89H5.89C4.85 4.58 4 5.43 4 6.47zm13 2.03l-4.5 2.5v3l4.5 2.5V8.5zM6 8.5h3v2H6V8.5zm0 3h3v2H6v-2z"/%3E%3C/svg%3E'; // Placeholder video icon
        } else if (mediaType === 'audio') {
            previewSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23888"%3E%3Cpath d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6zm-2 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/%3E%3C/svg%3E'; // Placeholder audio icon
        }


        const preview = document.createElement('img');
        preview.className = 'umd-media-preview';
        preview.src = previewSrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // Transparent pixel
        preview.alt = mediaType + ' preview';
        // For actual image previews, handle potential errors
        if (mediaType === 'image') {
            preview.onerror = () => { preview.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E'; }; // Broken image icon
        }


        const infoDiv = document.createElement('div');
        infoDiv.className = 'umd-media-info';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'umd-media-name';
        const filename = getFilenameFromUrl(url);
        nameSpan.textContent = namePrefix + (filename.length > 50 ? filename.substring(0, 47) + '...' : filename) ;
        const urlSpan = document.createElement('div');
        urlSpan.className = 'umd-media-url';
        urlSpan.textContent = url;
        urlSpan.title = url;
        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(urlSpan);

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'umd-download-btn';
        downloadBtn.textContent = '⬇️ Download';
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent panel drag or other parent events
            downloadBtn.textContent = '⏳...';
            downloadBtn.disabled = true;

            const finalFilename = getFilenameFromUrl(url);

            // Try GM_download first as it's simpler
            try {
                 console.log(`Attempting GM_download for: ${url} as ${finalFilename}`);
                 GM_download({
                    url: url,
                    name: finalFilename,
                    onload: () => {
                        downloadBtn.textContent = '✅ Done';
                        setTimeout(() => {
                           downloadBtn.textContent = '⬇️ Download';
                           downloadBtn.disabled = false;
                        }, 2000);
                    },
                    onerror: (err) => {
                        console.error('GM_download error:', err, 'Trying fallback for', url);
                        // Fallback to GM_xmlhttpRequest if GM_download fails (e.g. CORS issue not handled by GM_download or needs blob)
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            responseType: "blob",
                            onload: function(response) {
                                if (response.status >= 200 && response.status < 300) {
                                    const blobUrl = URL.createObjectURL(response.response);
                                    const a = document.createElement('a');
                                    a.href = blobUrl;
                                    a.download = finalFilename;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(blobUrl);
                                    downloadBtn.textContent = '✅ Done (blob)';
                                } else {
                                    console.error('GM_xmlhttpRequest HTTP error:', response.statusText, 'for', url);
                                    downloadBtn.textContent = '❌ Error';
                                    alert(`Failed to download ${finalFilename}. Status: ${response.statusText}`);
                                }
                                setTimeout(() => {
                                   downloadBtn.textContent = '⬇️ Download';
                                   downloadBtn.disabled = false;
                                }, 2000);
                            },
                            onerror: function(err) {
                                console.error('GM_xmlhttpRequest network error:', err, 'for', url);
                                downloadBtn.textContent = '❌ Error';
                                alert(`Failed to download ${finalFilename}. Network error.`);
                                setTimeout(() => {
                                   downloadBtn.textContent = '⬇️ Download';
                                   downloadBtn.disabled = false;
                                }, 2000);
                            }
                        });
                    },
                    ontimeout: () => {
                        console.error('GM_download timeout for', url);
                        downloadBtn.textContent = '❌ Timeout';
                         setTimeout(() => {
                           downloadBtn.textContent = '⬇️ Download';
                           downloadBtn.disabled = false;
                        }, 2000);
                    }
                });
            } catch (e) {
                 console.error("Error initiating GM_download: ", e);
                 downloadBtn.textContent = '❌ Error';
                 alert(`Error initiating download for ${finalFilename}: ${e.message}`);
                 setTimeout(() => {
                    downloadBtn.textContent = '⬇️ Download';
                    downloadBtn.disabled = false;
                 }, 2000);
            }
        });

        itemDiv.appendChild(preview);
        itemDiv.appendChild(infoDiv);
        itemDiv.appendChild(downloadBtn);
        return itemDiv;
    }

    function scanMedia() {
        mediaListContainer.innerHTML = ''; // Clear previous results
        let foundCount = 0;

        const sections = {
            images: document.createElement('div'),
            videos: document.createElement('div'),
            audios: document.createElement('div'),
        };
        sections.images.className = 'umd-media-category';
        sections.videos.className = 'umd-media-category';
        sections.audios.className = 'umd-media-category';
        sections.images.innerHTML = '<h4>🖼️ Images</h4>';
        sections.videos.innerHTML = '<h4>🎬 Videos</h4>';
        sections.audios.innerHTML = '<h4>🎵 Audio</h4>';

        const addedUrls = new Set(); // To avoid duplicates

        // Find Images
        let imgCount = 0;
        document.querySelectorAll('img').forEach(img => {
            if (img.src) {
                const absSrc = getAbsoluteUrl(img.src);
                if (!addedUrls.has(absSrc) && !absSrc.startsWith('data:image/svg+xml') && !absSrc.startsWith('data:image/gif')) { // Avoid internal icons/placeholders
                    // Basic filter for very small images (likely UI elements)
                    if (img.naturalWidth > 50 || img.naturalHeight > 50 || img.width > 50 || img.height > 50 || !img.complete) { // Check if loaded for natural dimensions
                        sections.images.appendChild(createMediaItemElement('image', absSrc));
                        addedUrls.add(absSrc);
                        imgCount++;
                    }
                }
            }
            // Check srcset for responsive images
            if (img.srcset) {
                const sources = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
                sources.forEach(src => {
                    const absSrc = getAbsoluteUrl(src);
                     if (!addedUrls.has(absSrc) && !absSrc.startsWith('data:image/svg+xml') && !absSrc.startsWith('data:image/gif')) {
                        sections.images.appendChild(createMediaItemElement('image', absSrc));
                        addedUrls.add(absSrc);
                        imgCount++;
                    }
                });
            }
        });
        if (imgCount === 0) sections.images.innerHTML += '<p class="umd-no-media">No images found.</p>';
        mediaListContainer.appendChild(sections.images);
        foundCount += imgCount;

        // Find Videos
        let videoCount = 0;
        document.querySelectorAll('video').forEach(video => {
            if (video.src) {
                const absSrc = getAbsoluteUrl(video.src);
                if (!addedUrls.has(absSrc)) {
                    sections.videos.appendChild(createMediaItemElement('video', absSrc));
                    addedUrls.add(absSrc);
                    videoCount++;
                }
            }
            video.querySelectorAll('source').forEach(source => {
                if (source.src) {
                    const absSrc = getAbsoluteUrl(source.src);
                    if (!addedUrls.has(absSrc)) {
                        sections.videos.appendChild(createMediaItemElement('video', absSrc, `(Source: ${source.type || 'video'}) `));
                        addedUrls.add(absSrc);
                        videoCount++;
                    }
                }
            });
        });
        if (videoCount === 0) sections.videos.innerHTML += '<p class="umd-no-media">No videos found.</p>';
        mediaListContainer.appendChild(sections.videos);
        foundCount += videoCount;

        // Find Audio
        let audioCount = 0;
        document.querySelectorAll('audio').forEach(audio => {
            if (audio.src) {
                const absSrc = getAbsoluteUrl(audio.src);
                if (!addedUrls.has(absSrc)) {
                    sections.audios.appendChild(createMediaItemElement('audio', absSrc));
                    addedUrls.add(absSrc);
                    audioCount++;
                }
            }
            audio.querySelectorAll('source').forEach(source => {
                if (source.src) {
                    const absSrc = getAbsoluteUrl(source.src);
                    if (!addedUrls.has(absSrc)) {
                        sections.audios.appendChild(createMediaItemElement('audio', absSrc, `(Source: ${source.type || 'audio'}) `));
                        addedUrls.add(absSrc);
                        audioCount++;
                    }
                }
            });
        });
        if (audioCount === 0) sections.audios.innerHTML += '<p class="umd-no-media">No audio files found.</p>';
        mediaListContainer.appendChild(sections.audios);
        foundCount += audioCount;

        // CSS Background Images (simple check on body, could be expanded)
        // This is very basic and might not catch many. A full scan is resource-intensive.
        /*
        const elementsWithBg = document.querySelectorAll('body, div, section, header, footer, main, article, aside'); // Add more selectors if needed
        elementsWithBg.forEach(el => {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none' && bgImage.startsWith('url("')) {
                const urlMatch = bgImage.match(/url\("?([^"]+)"?\)/);
                if (urlMatch && urlMatch[1]) {
                    const absUrl = getAbsoluteUrl(urlMatch[1]);
                    if (!addedUrls.has(absUrl) && !absUrl.startsWith('data:')) {
                        // Could add to images, but need to decide if this is wanted - often decorative
                        // console.log('Found CSS background image:', absUrl);
                        // sections.images.appendChild(createMediaItemElement('image', absUrl, '(CSS Background) '));
                        // addedUrls.add(absUrl);
                        // imgCount++; foundCount++;
                    }
                }
            }
        });
        */


        if (foundCount === 0) {
            mediaListContainer.innerHTML = '<p class="umd-no-media">No media found on the page with common tags. Some media might be embedded in complex ways or dynamically loaded.</p>';
        }
    }

    // --- INITIALIZATION ---
    console.log('Universal Media Downloader UI initialized.');

})();
