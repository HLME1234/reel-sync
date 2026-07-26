export class Comm {
  resolve(msg) {
    return {
      command: msg.split("|")[0],
      data: msg.split("|")[1]
        ? msg
            .split("|")[1]
            .split("&")
            .reduce((acc, curr) => {
              const [key, value] = curr.split("=");
              acc[key] = value ? decodeURIComponent(value) : value;
              return acc;
            }, {})
        : null,
    };
  }
  host = {
    timestamp() {
      return `timestamp|atu=${Date.now()}`;
    },
    origin(oriURL) {
      return `origin|ori=${oriURL}`;
    },
    play() {
      return "play";
    },
    pause() {
      return "pause";
    },
    seek(time) {
      return `seek|time=${time}`;
    },
    latency(latency) {
      return `latency|lat=${latency}`;
    },
    rttPing(ts) {
      return `rtt-ping|ts=${ts}`;
    },
    rttPong(ts) {
      return `rtt-pong|ts=${ts}&ts2=${Date.now()}`;
    },
    voiceEnabled() {
      return "voice-enabled";
    },
    voiceDisabled() {
      return "voice-disabled";
    },
    shutdown() {
      return "shutdown";
    },
    // 新增：广播字幕（content 请传原始文本，方法内部会做 Base64 + URI encode）
    subtitles(name, content) {
      const b64 = typeof window !== "undefined"
        ? window.btoa(unescape(encodeURIComponent(content)))
        : Buffer.from(content, "utf-8").toString("base64");
      return `subtitles|name=${encodeURIComponent(name)}&content=${encodeURIComponent(b64)}`;
    },
  };
  client = {
    greet(guestID) {
      return `connected|gid=${guestID}`;
    },
    progress(currentTime, timeStamp) {
      return `progress|cur=${currentTime}&atu=${timeStamp}`; // atu: AbsoluteTimeUnix
    },
    latency(latency) {
      return `latency|lat=${latency}`;
    },
    rttPing(ts) {
      return `rtt-ping|ts=${ts}`;
    },
    rttPong(ts) {
      return `rtt-pong|ts=${ts}&ts2=${Date.now()}`;
    },
    voiceEnabled() {
      return "voice-enabled";
    },
    voiceDisabled() {
      return "voice-disabled";
    },
    shutdown() {
      return "shutdown";
    },
    // client 端也可能发送字幕
    subtitles(name, content) {
      const b64 = typeof window !== "undefined"
        ? window.btoa(unescape(encodeURIComponent(content)))
        : Buffer.from(content, "utf-8").toString("base64");
      return `subtitles|name=${encodeURIComponent(name)}&content=${encodeURIComponent(b64)}`;
    },
  };
}
