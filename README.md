# Linkdrop

A build-free video downloader website for GitHub Pages. Visitors paste a public link and select **Download video**. **Use sample link** loads a five-second clip included with the site.

The [live Linkdrop site](https://vhouriz.github.io/linkdrop/) connects to a free Cobalt server on Render and records aggregate visits and page views with Cloudflare Web Analytics.

## Publish on GitHub Pages

1. Put the contents of this project in the root of your GitHub repository. Keep the `assets` directory alongside `index.html`.
2. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the branch containing the files, choose **/(root)**, and save. GitHub displays the published URL when deployment finishes.

All asset paths are relative, so the same files work at both `username.github.io` and `username.github.io/repository/`. To preview locally, open `index.html` or serve the directory with a static web server.

## Supported links

| Link | How it works |
| --- | --- |
| A direct video file | The browser fetches the video and starts a download. Extensionless URLs work when the host allows browser access and serves a video MIME type. |
| Internet Archive item | Reads the public file list. Items with several video files show a selector. |
| Wikimedia Commons video file page | Resolves the original video through the MediaWiki API. |
| Public HTML page | When the page permits browser access, Linkdrop checks video elements, video metadata, video download links and embedded YouTube or Vimeo players. |
| YouTube | For watch, share, Shorts, live and embed links, Linkdrop sends the video ID to Wikimedia Commons and looks for a video that credits that exact ID as a source. Visitors can review the file and license before downloading it. If no file is available, Linkdrop tries the connected server. [Try NASA’s Apollo 13 video](https://vhouriz.github.io/linkdrop/?video=https%3A%2F%2Fyoutu.be%2FIlifg26TZrI). |
| TikTok, Vimeo and other supported platforms | Uses the connected Cobalt API. Availability depends on the platform and instance. |

For hosts that block cross-origin reads, the site offers to open a direct video in the original player. For videos above 64 MiB it offers streaming to disk in browsers with a file picker, or opens the original video for saving through the browser. Private videos, DRM-protected streams and arbitrary streaming manifests are outside the site's supported formats.

## Connect a download server for platform links

### Free Render setup for a small site

1. Push this project to GitHub, including `render.yaml` at the repository root and `server/Dockerfile`.
2. In the Render dashboard, select **New → Blueprint** and connect your GitHub repository. The included template selects one **Free** web service. [Render Blueprint setup](https://render.com/docs/infrastructure-as-code)
3. When Render asks for `CORS_URL`, enter your site's origin. For a website at `https://username.github.io/YoutubeDownloader/`, enter only `https://username.github.io`. Then select **Deploy Blueprint**.
4. When the service is **Live**, copy its public HTTPS address from the dashboard. In your GitHub repository, set `window.LINKDROP_API` in `config.js` to that address and commit the change.
5. After Pages republishes, test a public video page from a supported platform. The built-in sample downloads directly, so it tests the website only. Availability depends on the platform and whether it accepts requests from your server. [Cobalt's supported platforms](https://github.com/imputnet/cobalt/tree/main/api#supported-services)

Render's free web service sleeps after 15 idle minutes and can take about a minute to wake. Videos that pass through the server consume outbound bandwidth. For a zero-spend setup, use a free workspace without a payment method. At the bandwidth limit Render suspends free services for the rest of the month. With a payment method, bandwidth overages can incur charges. Heavy outbound traffic can also trigger suspension. [Render free-tier details](https://render.com/docs/free)

### On your own Docker host

1. On a Docker host, copy the included `server` folder and point a domain name at that host. Allow incoming traffic on ports 80 and 443. The supplied Compose file runs Cobalt behind Caddy, which handles HTTPS. [Cobalt hosting guide](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md)
2. On that host, create `server/.env` with your two public addresses. A project site's origin omits the repository path.

```dotenv
DOWNLOAD_HOST=downloads.example.com
PAGES_ORIGIN=https://username.github.io
```

3. Run `docker compose up -d` inside `server`. The configuration restricts browser access to the Pages origin. Cobalt's rate limits also apply. [Cobalt configuration](https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md)
4. Edit `config.js` in your Pages repository and publish the change.

```js
window.LINKDROP_API = "https://downloads.example.com/";
```

The frontend posts platform links to that endpoint and handles tunnel, redirect and multi-video picker responses. If your instance requires a secret API key, keep it in a server-side gateway and set the frontend URL to the gateway. Values in GitHub Pages JavaScript are public. The default configuration makes no requests to any shared download server. [Cobalt API](https://github.com/imputnet/cobalt/blob/main/docs/api.md)

## See how many people visit

Cloudflare Web Analytics offers free visit and page-view counts for a GitHub Pages site. The site currently allows anonymous visitors. Seeing a person's name or email would require them to share it, for example through sign-in. [About Web Analytics](https://developers.cloudflare.com/web-analytics/about/)

1. In Cloudflare, open **Web Analytics → Add a site**. Enter your Pages hostname, such as `username.github.io`.
2. When deploying your own copy, replace the existing Cloudflare snippet before `</body>` in `index.html` with the snippet from **Manage site** and commit the change to GitHub.
3. After Pages republishes, visit the site. Give it a few minutes, then open your Web Analytics dashboard to see traffic. Direct and server-assisted downloads use the same page, so page views measure visits to the tool. [Cloudflare setup guide](https://developers.cloudflare.com/web-analytics/get-started/)

## Sample clip

The local sample video and its poster frame come from MDN’s CC0 flower video. [Original sample](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4) · [License](https://github.com/mdn/interactive-examples/blob/main/LICENSE)
