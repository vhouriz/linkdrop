"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const input = byId("url");
  const submit = byId("submit");
  const cancel = byId("cancel");
  const paste = byId("paste");
  const example = byId("sample-link");
  const feedback = byId("feedback");
  const message = byId("status-message");
  const actions = byId("file-actions");
  const progress = byId("progress");
  const api = window.LINKDROP_API?.trim();
  let operation;
  let timer;
  let blobUrl;

  function clearFeedback() {
    feedback.hidden = true;
    actions.replaceChildren();
    progress.hidden = true;
    message.textContent = "";
    input.removeAttribute("aria-invalid");
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  }

  function say(text, error = false) {
    feedback.hidden = false;
    feedback.dataset.error = String(error);
    message.textContent = text;
  }

  function touch(timeoutMs = 45000) {
    clearTimeout(timer);
    timer = setTimeout(() => operation?.abort("timeout"), timeoutMs);
  }

  function report(bytes, total) {
    touch();
    progress.hidden = false;
    if (total > 0) {
      progress.max = Math.max(bytes, total);
      progress.value = bytes;
    } else { progress.removeAttribute("value"); }
  }

  async function run(work) {
    if (operation) return;
    const controller = new AbortController();
    operation = controller;
    clearFeedback();
    input.readOnly = true;
    paste.disabled = example.disabled = submit.disabled = true;
    submit.querySelector("span").textContent = "Working…";
    cancel.hidden = false;
    progress.hidden = false;
    progress.removeAttribute("value");
    touch();
    try { await work(controller.signal); }
    catch (error) {
      actions.replaceChildren();
      if (controller.signal.reason === "timeout") say("The source took too long to respond. Try again.", true);
      else if (controller.signal.aborted || error.name === "AbortError") say("Download canceled.");
      else say(error instanceof TypeError ? "Could not reach the video source. Check your connection or try a direct video link." : error.message, true);
    } finally {
      clearTimeout(timer);
      operation = null;
      input.readOnly = false;
      paste.disabled = example.disabled = submit.disabled = false;
      submit.querySelector("span").textContent = "Download video";
      cancel.hidden = progress.hidden = true;
    }
  }

  function link(text, href, name) {
    const anchor = document.createElement("a");
    anchor.textContent = text;
    anchor.href = href;
    if (name) anchor.download = name;
    else { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
    actions.append(anchor);
    return anchor;
  }

  function button(text, onclick) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "text-button";
    element.textContent = text;
    element.addEventListener("click", onclick);
    actions.append(element);
    return element;
  }

  async function streamToDisk(result, signal) {
    say("Choose where to save " + result.name + ".");
    clearTimeout(timer);
    const handle = await window.showSaveFilePicker({ suggestedName: result.name });
    signal.throwIfAborted();
    touch();
    const response = await Linkdrop.request(result.url, signal);
    if (!response.ok || !Linkdrop.isMedia(Linkdrop.contentType(response), result.name) || !response.body) {
      await response.body?.cancel();
      throw new Error("The source no longer has this video. Submit its link again.");
    }
    const total = Number(response.headers.get("Content-Length")) || 0;
    let bytes = 0;
    const monitor = new TransformStream({
      transform(chunk, output) { bytes += chunk.byteLength; report(bytes, total); output.enqueue(chunk); }
    });
    const destination = await handle.createWritable();
    say("Saving " + result.name + "…");
    await response.body.pipeThrough(monitor).pipeTo(destination, { signal });
    say("Saved " + handle.name + ".");
  }

  async function download(file, signal) {
    say("Preparing your video…");
    const result = await Linkdrop.getFile(file, signal, report);
    if (result.open) {
      say("The host could not be read here. Open the video and use the player’s download or Save video as option.");
      link("Open original video ↗", result.url);
    } else if (result.large) {
      if (typeof window.showSaveFilePicker === "function") {
        say("This large video is ready to save directly to your device.");
        button("Save video file", () => run(nextSignal => streamToDisk(result, nextSignal)));
      } else { say("Open this large video and use the player’s download or Save video as option."); }
      link("Open original video ↗", result.url);
    } else {
      const href = result.native ? result.url : (blobUrl = URL.createObjectURL(result.blob));
      say(result.name + " is ready. Your browser handles the download.");
      link("Save file again", href, result.name).click();
    }
  }

  function chooseFile(files) {
    say("This link contains several videos. Choose a file to download.");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Video file");
    files.forEach((file, index) => {
      const option = document.createElement("option");
      option.textContent = file.name || file.label || "Video " + (index + 1);
      option.value = String(index);
      select.append(option);
    });
    actions.append(select);
    button("Download selected file", () => {
      const selected = files[select.selectedIndex];
      run(signal => download(selected, signal));
    });
  }

  byId("download-form").addEventListener("submit", event => {
    event.preventDefault();
    if (operation) return;
    let url;
    try { url = Linkdrop.parseInput(input.value); }
    catch (error) {
      clearFeedback();
      say(error.message, true);
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    run(async signal => {
      say("Finding the video…");
      // A free download server may take about a minute to wake up.
      if (api) touch(120000);
      const files = await Linkdrop.resolve(url, api, signal);
      touch();
      if (!files.length) throw new Error("This page has no public video file available.");
      if (files.length > 1) chooseFile(files);
      else await download(files[0], signal);
    });
  });

  input.addEventListener("input", clearFeedback);
  cancel.addEventListener("click", () => operation?.abort("cancel"));
  example.addEventListener("click", () => {
    clearFeedback();
    input.value = Linkdrop.sample;
    input.focus();
  });
  paste.addEventListener("click", async () => {
    clearFeedback();
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (operation) return;
      if (value) input.value = value;
      else say("Copy a video link first, then paste it here.");
    } catch { if (!operation) say("Paste the link into the field using your keyboard or touch menu."); }
    if (!operation) input.focus();
  });

  const video = byId("sample-video");
  const play = byId("play");
  function resetPlayer() {
    video.controls = false;
    play.hidden = false;
    video.closest(".film").classList.remove("playing");
  }
  play.addEventListener("click", async () => {
    try {
      if (video.ended) video.currentTime = 0;
      video.controls = true;
      play.hidden = true;
      video.closest(".film").classList.add("playing");
      await video.play();
      video.focus();
    } catch {
      resetPlayer();
      say("The preview could not play. Use the sample link to download the clip.", true);
    }
  });
  video.addEventListener("ended", resetPlayer);
  if (api) byId("platform-info").textContent = "Supported video pages are sent to the site's connected download server. Availability varies by platform.";
})();
