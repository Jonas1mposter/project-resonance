const app = getApp();

Page({
  data: {
    url: ''
  },

  onLoad() {
    this._buildAndSetUrl();
  },

  onShow() {
    // Check if we have a new transcript from the native recording page
    if (app.globalData.hasNewTranscript) {
      const transcript = app.globalData.lastTranscript || '';
      const duration = app.globalData.lastRecordDuration || 0;
      
      // Clear the flag
      app.globalData.hasNewTranscript = false;
      
      // Rebuild URL with transcript data as query params
      const base = app.globalData.webviewUrl;
      const sep = base.includes('?') ? '&' : '?';
      const params = `wxTranscript=${encodeURIComponent(transcript)}&wxDuration=${duration}&t=${Date.now()}`;
      const newUrl = `${base}${sep}${params}`;
      
      console.log('[WebView] Reloading with transcript:', transcript);
      this.setData({ url: newUrl });
    }
  },

  _buildAndSetUrl() {
    const url = app.globalData.webviewUrl;
    console.log('[WebView] Loading URL:', url);
    this.setData({ url });
  },

  onMessage(e) {
    console.log('[WebView Message]', e.detail.data);
    const messages = e.detail?.data || [];
    if (!messages || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1] || {};
    const msgType = lastMsg.type || (lastMsg.data && lastMsg.data.type);

    if (msgType === 'navigate') {
      wx.navigateBack();
      return;
    }

    if (msgType === 'startRecord') {
      this._openRecordPage();
    }
  },

  _openRecordPage() {
    const paths = ['/pages/record/record', '../record/record'];
    const tryOpen = (index) => {
      if (index >= paths.length) {
        wx.showToast({ title: '录音页打开失败', icon: 'none' });
        return;
      }

      wx.navigateTo({
        url: paths[index],
        fail: (err) => {
          console.error('[WebView] navigateTo failed:', paths[index], err);
          tryOpen(index + 1);
        }
      });
    };

    tryOpen(0);
  },

  onError(e) {
    console.error('[WebView Error]', e.detail);
    wx.showModal({
      title: '加载失败',
      content: '页面加载出错，请检查网络后重试。',
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.setData({ url: '' });
          setTimeout(() => {
            this._buildAndSetUrl();
          }, 100);
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  onWebviewLoad() {
    console.log('[WebView] Page loaded successfully');
  },

  onShareAppMessage() {
    return {
      title: '共鸣 - 构音障碍语音识别训练系统',
      path: '/pages/index/index'
    };
  }
});
