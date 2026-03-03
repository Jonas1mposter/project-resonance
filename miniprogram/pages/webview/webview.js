const app = getApp();

Page({
  data: {
    url: ''
  },

  onLoad() {
    this.setData({
      url: app.globalData.webviewUrl
    });
  },

  onMessage(e) {
    // 接收网页通过 wx.miniProgram.postMessage 发送的消息
    console.log('[WebView Message]', e.detail.data);
  },

  onError(e) {
    console.error('[WebView Error]', e.detail);
    wx.showToast({
      title: '页面加载失败',
      icon: 'none'
    });
  }
});
