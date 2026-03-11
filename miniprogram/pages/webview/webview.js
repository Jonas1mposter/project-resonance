const app = getApp();

Page({
  data: {
    url: ''
  },

  onLoad() {
    const url = app.globalData.webviewUrl;
    console.log('[WebView] Loading URL:', url);
    this.setData({ url });
  },

  onMessage(e) {
    console.log('[WebView Message]', e.detail.data);
    const messages = e.detail.data;
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.type === 'navigate') {
        wx.navigateBack();
      }
    }
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
            this.setData({ url: app.globalData.webviewUrl });
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
