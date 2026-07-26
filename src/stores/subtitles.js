import { defineStore } from "pinia";

export const useSubtitlesStore = defineStore("subtitles", {
  state: () => ({
    localSubtitle: null, // { name, content } 本地上传的字幕
    roomSubtitle: null,  // { name, content } 房间级字幕（由 host 或后端决定）
  }),
  actions: {
    setLocalSubtitle(obj) {
      this.localSubtitle = obj;
    },
    clearLocalSubtitle() {
      this.localSubtitle = null;
    },
    setRoomSubtitle(obj) {
      this.roomSubtitle = obj;
    },
    clearRoomSubtitle() {
      this.roomSubtitle = null;
    },
    getRoomSubtitle() {
      return this.roomSubtitle || null;
    }
  }
});
