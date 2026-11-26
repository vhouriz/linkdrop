"use strict";

const Linkdrop = (() => {
  const videoExtension = /\.(mp4|m4v|webm|mov|mkv|avi|ogv|mpeg|mpg|wmv|flv|3gp|ts|m2ts)$/i;
  const mediaTypes = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "video/ogg": "ogv", "application/ogg": "ogv", "video/x-matroska": "mkv",
    "video/mpeg": "mpg", "video/mp2t": "ts", "video/x-msvideo": "avi",
    "video/x-ms-wmv": "wmv", "video/x-flv": "flv", "video/3gpp": "3gp", "image/gif": "gif",
  };
  const memoryLimit = 64 * 1024 * 1024;
  const platform = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|vimeo\.com|x\.com|twitter\.com|reddit\.com|redd\.it|bilibili\.com|twitch\.tv)$/i;
  const sample = new URL("./assets/garden.mp4", document.baseURI).href;

  function webUrl(value) {
    try {
      const url = new URL(value);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url;
    } catch { /* The caller supplies the appropriate error message. */ }
    return null;
  }

  function parseInput(text) {
    const input = text.trim();
    if (input === sample) return new URL(sample);
    const url = webUrl(/^([\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#]|$)/i.test(input) ? "https://" + input : input);
    if (!url || /\s/.test(input)) throw new Error("Enter one complete video link, such as https://example.com/video.mp4.");
    return url;
  }

  function decoded(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function filename(url, hint, type) {
    const raw = hint || decoded(url.pathname.split("/").pop() || "video");
    const name = raw.replace(/[\\/:*?"<>|\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, "_").replace(/^[. ]+|[. ]+$/g, "") || "video";
    const allowed = name.match(videoExtension) || (type === "image/gif" && name.match(/\.(gif)$/i));
    const suffix = allowed ? allowed[1].toLowerCase() : mediaTypes[type] || "video";
    const stem = allowed ? name.slice(0, -allowed[0].length) : name;
    return (stem.slice(0, 125) || "video") + "." + suffix;
  }

  function request(url, signal, options = {}) {
    return fetch(url, { ...options, signal, credentials: "omit", referrerPolicy: "no-referrer" });
  }

  async function json(url, signal, options) {
    const response = await request(url, signal, options);
    if (response.status === 429) throw new Error("The source is receiving too many requests. Try again shortly.");
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (body?.error?.code === "error.api.youtube.login") {
        throw new Error("YouTube asked the download server to sign in. If the creator shared a video file in the description, paste that link here.");
      }
      throw new Error("The source declined this request (HTTP " + response.status + ").");
    }
    return response.json();
  }

  async function archiveFiles(id, signal) {
    const item = await json("https://archive.org/metadata/" + encodeURIComponent(id), signal);
    return (item.files || []).filter(file => typeof file.name === "string" && videoExtension.test(file.name)
      && ![true, "true"].includes(file.private) && !file.name.split("/").some(s => s === "." || s === ".."))
      .map(file => ({
        url: "https://archive.org/download/" + encodeURIComponent(id) + "/" + file.name.split("/").map(encodeURIComponent).join("/"),
        name: file.name.split("/").pop(),
      }));
  }

  async function commonsFile(title, signal) {
    const query = new URLSearchParams({ action: "query", prop: "imageinfo", iiprop: "url|mime", titles: title,
      format: "json", formatversion: "2", redirects: "1", origin: "*" });
    const data = await json("https://commons.wikimedia.org/w/api.php?" + query, signal);
    const page = data.query?.pages?.[0];
    const file = page?.imageinfo?.[0];
    if (!file || !webUrl(file.url) || !(file.mime?.startsWith("video/") || file.mime === "application/ogg")) return [];
    return [{ url: file.url, name: page.title.replace(/^File:/i, "") }];
  }

  function youtubeId(url) {
    if (!url) return null;
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    const parts = url.pathname.split("/");
    let id;
    if (host === "youtu.be") id = parts[1];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (["shorts", "embed", "live", "v"].includes(parts[1])) id = parts[2];
    }
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  }

  async function commonsCopies(id, signal) {
    const query = new URLSearchParams({ action: "query", generator: "exturlusage", geunamespace: "6",
      geuprotocol: "", geulimit: "20", prop: "imageinfo", iiprop: "url|mediatype|extmetadata|size",
      iiextmetadatafilter: "Credit", format: "json", formatversion: "2", origin: "*" });
    for (const reference of ["www.youtube.com/watch?v=" + id, "youtu.be/" + id]) {
      query.set("geuquery", reference);
      const data = await json("https://commons.wikimedia.org/w/api.php?" + query, signal);
      const matches = [];
      for (const page of data.query?.pages || []) {
        const file = page.imageinfo?.[0];
        if (file?.mediatype !== "VIDEO" || webUrl(file.url)?.origin !== "https://upload.wikimedia.org"
            || webUrl(file.descriptionurl)?.origin !== "https://commons.wikimedia.org") continue;
        // External-link search also finds incidental mentions. Require the ID in the file's source credit.
        const credit = document.createElement("template");
        credit.innerHTML = file.extmetadata?.Credit?.value || "";
        if (![...credit.content.querySelectorAll("a[href]")].some(a => youtubeId(webUrl(a.getAttribute("href"))) === id)) continue;
        const name = page.title.replace(/^File:/i, "");
        const size = file.size ? " · " + (file.size / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " MiB" : "";
        matches.push({ url: file.url, name, label: name + size, sourcePage: file.descriptionurl });
      }
      if (matches.length) return matches;
    }
    return [];
  }

  async function youtubeFiles(id, api, signal) {
    // Keep a slow Commons lookup from consuming the time available for the download server.
    const lookup = typeof AbortSignal.any === "function" ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : signal;
    try {
      const files = await commonsCopies(id, lookup);
      if (files.length) return files;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    return platformFiles(new URL("https://www.youtube.com/watch?v=" + id), api, signal);
  }

  async function platformFiles(url, api, signal) {
    if (!api) throw new Error("This video page needs a download server. Try a direct video file, Internet Archive item or Wikimedia Commons video.");
    const endpoint = webUrl(api);
    if (!endpoint || (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname))) {
      throw new Error("The site's download server address needs to be updated.");
    }
    const data = await json(endpoint, signal, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.href, downloadMode: "auto", localProcessing: "disabled" }),
    });
    if (["redirect", "tunnel"].includes(data.status) && webUrl(data.url)) return [{ url: data.url, name: data.filename }];
    if (data.status === "picker") {
      return (data.picker || []).filter(item => ["video", "gif"].includes(item.type) && webUrl(item.url))
        .map((item, i) => ({ url: item.url, label: "Video " + (i + 1) }));
    }
    throw new Error("The download server could not provide this video" + (data.error?.code ? " (" + data.error.code + ")." : "."));
  }

  async function readLimited(response, limit, onProgress) {
    const total = Number(response.headers.get("Content-Length")) || 0;
    if (total > limit) { await response.body?.cancel(); return null; }
    if (!response.body) throw new Error("The source returned an empty file.");
    const reader = response.body.getReader();
    let size = 0;
    const parts = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return null; }
        parts.push(value);
        onProgress(size, total);
      }
    } finally { reader.releaseLock(); }
    if (!size) throw new Error("The source returned an empty file.");
    return new Blob(parts, { type: response.headers.get("Content-Type") || "application/octet-stream" });
  }

  function contentType(response) {
    return (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  }

  function isMedia(type, name) {
    return type.startsWith("video/") || type === "application/ogg" || type === "image/gif"
      || ((!type || type === "application/octet-stream" || type === "binary/octet-stream") && videoExtension.test(name));
  }

  async function resolve(url, api, signal) {
    if (url.href === sample) return [{ url: sample, name: "garden.mp4" }];
    const path = decoded(url.pathname);
    const archive = /^(?:www\.)?archive\.org$/.test(url.hostname) && path.match(/^\/(?:details|embed)\/([^/]+)/);
    if (archive) return archiveFiles(archive[1], signal);
    if (url.hostname === "commons.wikimedia.org") {
      const title = path.startsWith("/wiki/") ? path.slice(6) : url.searchParams.get("title");
      if (/^File:/i.test(title || "")) return commonsFile(title, signal);
    }
    if (videoExtension.test(path)) return [{ url: url.href }];
    const id = youtubeId(url);
    if (id) return youtubeFiles(id, api, signal);
    if (platform.test(url.hostname) || /\.(m3u8|mpd)$/i.test(path)) return platformFiles(url, api, signal);

    // Some CDNs use extensionless URLs. Reuse the opened response when it contains video.
    let response;
    try { response = await request(url, signal); }
    catch (error) {
      if (signal.aborted) throw error;
      if (api) return platformFiles(url, api, signal);
      throw new Error("This host could not be read from the browser. Try the direct video file link.");
    }
    const type = contentType(response);
    if (response.ok && isMedia(type, path)) return [{ url: response.url || url.href, response }];
    if (response.ok && type === "text/html") {
      const page = await readLimited(response, 1024 * 1024, () => {});
      if (page) {
        // A detached template keeps the remote document, scripts and media elements inert.
        const template = document.createElement("template");
        template.innerHTML = await page.text();
        const files = new Map();
        let base = response.url || url.href;
        const baseTag = template.content.querySelector("base[href]");
        if (baseTag) {
          try { base = webUrl(new URL(baseTag.getAttribute("href"), base).href)?.href || base; } catch { /* Use the page URL. */ }
        }
        for (const tag of template.content.querySelectorAll('video[src],video source[src],a[download][href],meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"],iframe[src]')) {
          const src = tag.getAttribute("src") || tag.getAttribute("content") || tag.getAttribute("href");
          if (!src) continue;
          let file;
          try { file = webUrl(new URL(src, base).href); } catch { continue; }
          if (!file || /\.(mpd|m3u8)$/i.test(file.pathname)) continue;
          if (tag.localName === "iframe" || tag.localName === "meta") {
            const id = youtubeId(file);
            const vimeo = file.hostname === "player.vimeo.com" && file.pathname.match(/^\/video\/(\d+)\/?$/);
            if (id || vimeo) {
              const vimeoHash = file.searchParams.get("h");
              const player = id ? "https://www.youtube.com/watch?v=" + id
                : "https://vimeo.com/" + vimeo[1] + (/^[a-z\d]+$/i.test(vimeoHash || "") ? "/" + vimeoHash : "");
              files.set(player, { player, label: (id ? "YouTube" : "Vimeo") + " · " + (tag.getAttribute("title") || id || vimeo[1]) });
              continue;
            }
            if (tag.localName === "iframe") continue;
          }
          if (["a", "meta"].includes(tag.localName) && !videoExtension.test(file.pathname)) continue;
          files.set(file.href, { url: file.href, label: decoded(file.pathname.split("/").pop() || "Video") });
        }
        if (files.size) return [...files.values()];
      }
    } else { await response.body?.cancel(); }
    if (!response.ok && !api) throw new Error("The host returned HTTP " + response.status + ". Check that the video is public.");
    return platformFiles(url, api, signal);
  }

  async function getFile(file, signal, onProgress) {
    const url = new URL(file.url);
    if (url.href === sample && url.protocol === "file:") return { native: true, url: sample, name: "garden.mp4" };
    let response;
    try { response = file.response || await request(url, signal); }
    catch (error) {
      if (signal.aborted) throw error;
      return { open: true, url: url.href };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("The host returned HTTP " + response.status + ". Check that the link is public and still valid.");
    }
    const type = contentType(response);
    const name = file.name || decoded(url.pathname.split("/").pop() || "");
    if (!isMedia(type, name)) {
      await response.body?.cancel();
      throw new Error("The link returned a page or another file type. Look for the original video file.");
    }
    const blob = await readLimited(response, memoryLimit, onProgress);
    return { blob, large: !blob, url: url.href, name: filename(url, file.name, type) };
  }

  return { parseInput, resolve, getFile, request, sample, isMedia, contentType };
})();
