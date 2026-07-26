<template>
  <div class="video-player">
    <video ref="video" controls crossorigin="anonymous"></video>

    <div class="subtitle-controls">
      <label class="btn">
        导入外挂字幕 (.srt / .vtt)
        <input type="file" accept=".srt,.vtt" @change="onSubtitleFile" style="display:none" ref="subInput" />
      </label>
      <button v-if="currentSubtitleName" @click="removeSubtitle">移除字幕</button>
      <button v-if="currentSubtitleName && canDownload" @click="downloadSubtitle">下载字幕</button>
      <div v-if="currentSubtitleName" class="subtitle-name">{{ currentSubtitleName }}</div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useSharedStore } from "../stores/shared";
import { useSubtitlesStore } from "../stores/subtitles";
import { Comm } from "../utils/comm";

export default {
  name: "VideoPlayer",
  setup() {
    const video = ref(null);
    const subInput = ref(null);
    const currentSubtitleName = ref("");
    const currentTrackEl = ref(null);
    const currentVttText = ref("");
    const canDownload = ref(true);

    const shared = useSharedStore();
    const subsStore = useSubtitlesStore();
    const comm = new Comm();

    const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB 上限

    // 更稳健的 SRT -> VTT 转换：去掉序号行、兼容 CRLF、替换时间分隔符
    function srtToVtt(srtText) {
      const text = srtText.replace(/\r/g, "");
      const blocks = text.split("\n\n").map(b => b.trim()).filter(Boolean);
      let vtt = "WEBVTT\n\n";
      for (const block of blocks) {
        const lines = block.split("\n");
        // 如果第一行为数字索引，移除
        if (/^\d+$/.test(lines[0])) lines.shift();
        if (lines.length === 0) continue;
        // 时间 行通常在第一行或第二行
        if (/-->/.test(lines[0])) {
          lines[0] = lines[0].replace(/,/g, ".");
        } else if (lines[1] && /-->/.test(lines[1])) {
          lines[1] = lines[1].replace(/,/g, ".");
        }
        vtt += lines.join("\n") + "\n\n";
      }
      return vtt;
    }

    function trimSafe(str) {
      return (str || "").trim();
    }

    function createTrackFromVtt(vttContent, label = "外挂字幕") {
      if (!video.value) return null;
      const blob = new Blob([vttContent], { type: "text/vtt" });
      const url = URL.createObjectURL(blob);

      // 移除旧 track（只保留一个外挂字幕）
      if (currentTrackEl.value) {
        try {
          if (currentTrackEl.value.src) URL.revokeObjectURL(currentTrackEl.value.src);
        } catch (e) { /* ignore */ }
        currentTrackEl.value.remove();
        currentTrackEl.value = null;
      }

      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = label;
      track.srclang = "zh";
      track.src = url;
      track.default = true;
      video.value.appendChild(track);

      track.addEventListener("load", () => {
        try {
          const txtTracks = video.value.textTracks;
          for (let i = 0; i < txtTracks.length; i++) {
            // 设置显示
            if (txtTracks[i].label === label) {
              txtTracks[i].mode = "showing";
            } else {
              // 可选：隐藏其它非默认字幕
              // txtTracks[i].mode = 'hidden';
            }
          }
        } catch (err) { console.warn(err); }
      });

      currentTrackEl.value = track;
      currentSubtitleName.value = label;
      currentVttText.value = vttContent;
      subsStore.setLocalSubtitle({ name: label, content: vttContent }); // 同步到 store，供房间内其他逻辑读取
      return track;
    }

    async function onSubtitleFile(e) {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > MAX_FILE_BYTES) {
        alert(`文件过大，最大允许 ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)}MB`);
        e.target.value = "";
        return;
      }
      const name = f.name;
      const ext = name.split(".").pop().toLowerCase();
      const raw = await f.text();

      let vtt;
      if (ext === "srt") {
        vtt = srtToVtt(raw);
      } else if (ext === "vtt") {
        vtt = raw.startsWith("WEBVTT") ? raw : "WEBVTT\n\n" + raw;
      } else {
        alert("只支持 .srt 或 .vtt");
        e.target.value = "";
        return;
      }

      // 本地添加 track
      createTrackFromVtt(vtt, name);

      // 通过数据通道广播（如果存在）
      try {
        const dc = shared.peers?.remote?.data;
        if (dc && dc.readyState === "open") {
          const msg = comm.host.subtitles(name, vtt); // 会做 base64 编码
          dc.send(msg);
        } else {
          // 如果没有 P2P 通道，可选：上传到后端并共享 URL（见注释示例）
        }
      } catch (err) {
        console.warn("广播字幕失败", err);
      } finally {
        // 清空 input，允许重新上传同名文件
        if (subInput.value) subInput.value.value = "";
      }
    }

    function removeSubtitle() {
      if (currentTrackEl.value) {
        try {
          if (currentTrackEl.value.src) URL.revokeObjectURL(currentTrackEl.value.src);
        } catch (e) {}
        currentTrackEl.value.remove();
        currentTrackEl.value = null;
      }
      currentSubtitleName.value = "";
      currentVttText.value = "";
      subsStore.clearLocalSubtitle();

      // 通知对端移除（协议：subtitles-removed）
      try {
        const dc = shared.peers?.remote?.data;
        if (dc && dc.readyState === "open") {
          dc.send("subtitles-removed");
        }
      } catch (err) { /* ignore */ }
    }

    function downloadSubtitle() {
      if (!currentVttText.value) return;
      const blob = new Blob([currentVttText.value], { type: "text/vtt" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = currentSubtitleName.value || "subtitle.vtt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 延迟 revoke
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // 解析接收到 datachannel 消息
    function handleIncomingMessage(raw) {
      try {
        const parsed = comm.resolve(raw);
        if (!parsed || !parsed.command) return;
        if (parsed.command === "subtitles" && parsed.data) {
          const b64 = parsed.data.content;
          let vtt = "";
          try {
            const base64str = b64;
            const str = typeof window !== "undefined"
              ? decodeURIComponent(escape(window.atob(base64str)))
              : Buffer.from(base64str, "base64").toString("utf-8");
            vtt = str;
          } catch (e) {
            console.warn("字幕解码失败", e);
            return;
          }
          const name = parsed.data.name ? decodeURIComponent(parsed.data.name) : "remote-subtitles.vtt";
          createTrackFromVtt(vtt, name);
        } else if (parsed.command === "subtitles-removed") {
          removeSubtitle();
        }
      } catch (err) {
        console.warn("处理 datachannel 消息失败", err);
      }
    }

    // wrapper 用于 data channel event
    function onDataChannelEvent(ev) {
      const payload = ev.data;
      // 兼容原始字符串或事件对象含 data
      handleIncomingMessage(payload);
    }

    // 当 shared.peers.remote.data 变化时（在其他地方建立后）需要 attach listener
    function attachDataChannelListeners() {
      try {
        const dc = shared.peers?.remote?.data;
        if (!dc) return;
        if (dc.addEventListener) {
          dc.removeEventListener?.("message", onDataChannelEvent);
          dc.addEventListener("message", onDataChannelEvent);
        } else {
          const old = dc.onmessage;
          dc.onmessage = (ev) => {
            try { onDataChannelEvent(ev); } catch (e) {}
            if (typeof old === "function") old(ev);
          };
        }
      } catch (e) { console.warn(e); }
    }

    onMounted(() => {
      attachDataChannelListeners();

      // 如果房间里已经存在字幕（新加入者场景），从 store 加载
      const roomSub = subsStore.getRoomSubtitle();
      if (roomSub && roomSub.content) {
        createTrackFromVtt(roomSub.content, roomSub.name || "room-subtitles.vtt");
      }
    });

    // 监测 shared.peers 变化（例如在别处建立连接后）——你可以在建立通道的地方也手动调用 attachDataChannelListeners
    watch(() => shared.peers?.remote?.data, () => {
      attachDataChannelListeners();
    });

    onBeforeUnmount(() => {
      try {
        const dc = shared.peers?.remote?.data;
        if (dc && dc.removeEventListener) {
          dc.removeEventListener("message", onDataChannelEvent);
        }
      } catch (e) {}
      // 清理 track URL
      try {
        if (currentTrackEl.value && currentTrackEl.value.src) URL.revokeObjectURL(currentTrackEl.value.src);
      } catch (e) {}
    });

    return {
      video,
      subInput,
      onSubtitleFile,
      currentSubtitleName,
      removeSubtitle,
      canDownload,
      downloadSubtitle,
    };
  },
};
</script>

<style scoped>
.video-player {
  position: relative;
}
.subtitle-controls {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.btn {
  cursor: pointer;
  padding: 6px 10px;
  background: #2d8cf0;
  color: white;
  border-radius: 4px;
}
.subtitle-name {
  font-size: 0.9em;
  color: var(--mdui-color-on-surface-variant);
  max-width: 40ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
