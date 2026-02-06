/**
 * Service Worker for AI Made Simple v2.1
 * Provides offline capability and caching for better performance
 */

const CACHE_NAME = 'ai-made-simple-v2.1';
const CACHE_VERSION = '2.1.0';

// Files to cache for offline functionality
const CACHE_FILES = [
    '/',
    '/index.html',
    '/enhanced_web_interface_v2.html',
    '/video_preview_handler.js',
    '/status.html',
    '/about.html',
    '/cheatsheet.html',
    '/faq.html',
    // Add any CSS/JS files that are referenced
    // Note: External CDN resources won't be cached for security
];

// Install event - cache core files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core files');
                return cache.addAll(CACHE_FILES);
            })
            .then(() => {
                console.log('[SW] Core files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache core files:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip external requests (CDNs, APIs, etc.)
    if (url.origin !== location.origin) {
        return;
    }
    
    // Special handling for face swap API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }
    
    // Handle image uploads
    if (url.pathname.includes('upload') || request.headers.get('content-type')?.includes('multipart/form-data')) {
        // Don't cache uploads, always go to network
        event.respondWith(fetch(request));
        return;
    }
    
    // Cache-first strategy for static resources
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('[SW] Serving from cache:', request.url);
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Don't cache error responses
                        if (!response.ok) {
                            return response;
                        }
                        
                        // Clone response for caching
                        const responseToCache = response.clone();
                        
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                                console.log('[SW] Cached new resource:', request.url);
                            });
                        
                        return response;
                    })
                    .catch((error) => {
                        console.log('[SW] Network request failed:', request.url, error);
                        
                        // Serve offline fallback if available
                        return getOfflineFallback(request);
                    });
            })
    );
});

/**
 * Handle API requests with offline fallback
 */
function handleApiRequest(request) {
    const url = new URL(request.url);
    
    // Try network first for API requests
    return fetch(request)
        .then((response) => {
            // Cache successful API responses briefly
            if (response.ok && url.pathname === '/api/status') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME + '-api')
                    .then((cache) => {
                        // Cache for 5 minutes
                        cache.put(request, responseToCache);
                        setTimeout(() => {
                            cache.delete(request);
                        }, 5 * 60 * 1000);
                    });
            }
            
            return response;
        })
        .catch((error) => {
            console.log('[SW] API request failed, checking cache:', url.pathname);
            
            // Try to serve from cache
            return caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // Return offline API response
                    return getOfflineApiResponse(url.pathname);
                });
        });
}

/**
 * Get offline fallback responses
 */
function getOfflineFallback(request) {
    const url = new URL(request.url);
    
    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>AI Made Simple - Offline</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
                        color: #e4e4e7;
                        padding: 2rem;
                        text-align: center;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                    }
                    .offline-container {
                        max-width: 500px;
                        margin: 0 auto;
                    }
                    .offline-icon {
                        font-size: 4rem;
                        margin-bottom: 1rem;
                    }
                    .offline-title {
                        font-size: 2rem;
                        margin-bottom: 1rem;
                        color: #00d4ff;
                    }
                    .offline-message {
                        margin-bottom: 2rem;
                        opacity: 0.8;
                    }
                    .retry-button {
                        background: linear-gradient(135deg, #7c3aed, #a855f7);
                        color: white;
                        border: none;
                        padding: 1rem 2rem;
                        border-radius: 8px;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    .retry-button:hover {
                        transform: translateY(-2px);
                    }
                    .features-list {
                        text-align: left;
                        margin-top: 2rem;
                    }
                    .features-list li {
                        margin: 0.5rem 0;
                        opacity: 0.7;
                    }
                </style>
            </head>
            <body>
                <div class="offline-container">
                    <div class="offline-icon">🌐</div>
                    <h1 class="offline-title">You're Offline</h1>
                    <p class="offline-message">
                        AI Made Simple requires an internet connection for face swapping processing.
                        The interface is cached and ready when you're back online!
                    </p>
                    <button class="retry-button" onclick="window.location.reload()">
                        🔄 Try Again
                    </button>
                    
                    <div class="features-list">
                        <h3>✨ Available when online:</h3>
                        <ul>
                            <li>🎭 Real-time face swapping</li>
                            <li>👁️ Instant preview generation</li>
                            <li>🔍 Smart quality analysis</li>
                            <li>📱 Mobile-optimized interface</li>
                            <li>🎬 Video frame extraction</li>
                        </ul>
                    </div>
                </div>
                
                <script>
                    // Auto-retry when back online
                    window.addEventListener('online', () => {
                        window.location.reload();
                    });
                    
                    // Show online/offline status
                    window.addEventListener('offline', () => {
                        document.title = 'AI Made Simple - Offline';
                    });
                    
                    window.addEventListener('online', () => {
                        document.title = 'AI Made Simple - Back Online!';
                    });
                </script>
            </body>
            </html>
        `, {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
            }
        });
    }
    
    // Return 503 for other requests
    return new Response('Service Unavailable - You are offline', {
        status: 503,
        statusText: 'Service Unavailable'
    });
}

/**
 * Get offline API responses
 */
function getOfflineApiResponse(pathname) {
    switch (pathname) {
        case '/api/status':
            return new Response(JSON.stringify({
                status: 'offline',
                message: 'Service unavailable - you are offline',
                cached_data: true,
                timestamp: new Date().toISOString()
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
        case '/api/swap':
        case '/api/preview':
        case '/api/analyze':
            return new Response(JSON.stringify({
                error: 'Face swapping requires an internet connection',
                offline: true,
                suggestion: 'Please check your connection and try again'
            }), {
                status: 503,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
        default:
            return new Response(JSON.stringify({
                error: 'API unavailable offline',
                offline: true
            }), {
                status: 503,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
    }
}

// Handle background sync for failed uploads
self.addEventListener('sync', (event) => {
    if (event.tag === 'face-swap-retry') {
        console.log('[SW] Background sync triggered for face swap retry');
        event.waitUntil(retryFailedSwaps());
    }
});

/**
 * Retry failed face swaps when back online
 */
function retryFailedSwaps() {
    // This would connect to IndexedDB to retry failed operations
    // Implementation would depend on how failed operations are stored
    console.log('[SW] Retrying failed face swap operations...');
    
    return Promise.resolve(); // Placeholder
}

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    const options = {
        body: 'Your face swap is ready!',
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('AI Made Simple', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

// Periodic background sync (future feature)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'cleanup-cache') {
        console.log('[SW] Periodic sync: cleaning up cache');
        event.waitUntil(cleanupOldCache());
    }
});

/**
 * Cleanup old cached content
 */
function cleanupOldCache() {
    return caches.open(CACHE_NAME)
        .then((cache) => {
            return cache.keys().then((requests) => {
                const now = Date.now();
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                
                return Promise.all(
                    requests.map((request) => {
                        return cache.match(request).then((response) => {
                            if (response) {
                                const cachedTime = response.headers.get('sw-cached-time');
                                if (cachedTime && (now - parseInt(cachedTime)) > oneWeek) {
                                    console.log('[SW] Removing old cached file:', request.url);
                                    return cache.delete(request);
                                }
                            }
                        });
                    })
                );
            });
        });
}

// Log service worker events for debugging
console.log('[SW] Service Worker script loaded - AI Made Simple v' + CACHE_VERSION);