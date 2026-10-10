const cache = new Map();
const pending = new Map();
const CACHE_MS = 60 * 60 * 1000;

function failure(message, status = 502) { return Object.assign(new Error(message), { status }); }

async function searchVideos(title, artist) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw failure('YouTube playback is not configured yet. Add YOUTUBE_API_KEY to backend/.env and restart the backend.', 503);
  const key = JSON.stringify([title.toLowerCase(), artist.toLowerCase()]);
  const existing = cache.get(key);
  if (existing && Date.now() - existing.time < CACHE_MS) return existing.videos;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const params = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true',
      videoSyndicated: 'true', maxResults: '3', q: `${artist} ${title} official audio`, key: apiKey });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || data.error) {
      const reasons = (data.error?.errors || []).map((error) => error.reason);
      if (reasons.some((reason) => ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason))) {
        throw failure('The YouTube search quota has been reached. Please try again later.', 429);
      }
      if ([400, 401, 403].includes(response.status)) throw failure('YouTube search is unavailable. Check the server API key and enable YouTube Data API v3.', 503);
      throw failure('YouTube search is temporarily unavailable. Please try again.');
    }
    if (!Array.isArray(data.items)) throw failure('YouTube returned an unexpected search response.');
    const videos = data.items.filter((item) => /^[A-Za-z0-9_-]{11}$/.test(item.id?.videoId || ''))
      .map((item) => ({ videoId: item.id.videoId, title: item.snippet?.title || title, channel: item.snippet?.channelTitle || 'YouTube' }));
    if (cache.size >= 300) cache.delete(cache.keys().next().value);
    cache.set(key, { time: Date.now(), videos });
    return videos;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

function playerHtml(videoId) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw failure('Invalid YouTube video ID.', 400);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head>
  <body><div id="player"></div><script>
  function notify(code){var data={type:'youtube-player-error',videoId:'${videoId}',code:code};
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));
    else window.parent.postMessage(data,'*');}
  function ended(){var data={type:'youtube-player-ended',videoId:'${videoId}'};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));else window.parent.postMessage(data,'*');}
  function onYouTubeIframeAPIReady(){new YT.Player('player',{width:'100%',height:'100%',videoId:'${videoId}',
    playerVars:{autoplay:1,playsinline:1,controls:1,origin:window.location.origin},
    events:{onReady:function(e){e.target.playVideo();},onError:function(e){notify(e.data);},onStateChange:function(e){if(e.data===0)ended();}}});}
  var script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=function(){notify('network');};document.head.appendChild(script);
  </script></body></html>`;
}

module.exports = { searchVideos, playerHtml };
