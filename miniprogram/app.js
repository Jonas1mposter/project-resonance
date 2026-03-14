App({
  globalData: {
    // Add cache-busting to avoid stale H5 bundle in WeChat WebView
    webviewUrl: `https://project-resonance.cn?mp=1&t=${Date.now()}`,
    lastTranscript: "",
    lastRecordFilePath: "",
    lastRecordDuration: 0,
    hasNewTranscript: false,
    voiceCloned: false,
  },
});
