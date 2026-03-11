const app = getApp();

Page({
  data: {
    url: '',
    loading: true,
    loadError: false
  },

  onLoad() {
    this.setData({
      url: app.globalData.webviewUrl
    });

    // 15秒加载超时检测
    this._loadTimer = setTimeout(() => {
      if (this.data.loading) {
        this.setData({ loading: false, loadError: true });
        wx.showModal({
          title: '加载超时',
          content: '网页加载时间过长，可能是网络问题。是否重试？',
          success: (res) => {
            if (res.confirm) {
              this.retryLoad();
            } else {
              wx.navigateBack();
            }
          }
        });
      }
    }, 15000);
  },

  onUnload() {
    if (this._loadTimer) {
      clearTimeout(this._loadTimer);
    }
  },

  onMessage(e) {
    console.log('[WebView Message]', e.detail.data);
    const messages = e.detail.data;
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // 处理来自 Web 应用的消息
      if (lastMsg.type === 'navigate') {
        wx.navigateBack();
      }
    }
  },

  onError(e) {
    console.error('[WebView Error]', e.detail);
    if (this._loadTimer) {
      clearTimeout(this._loadTimer);
    }
    this.setData({ loading: false, loadError: true });
    wx.showModal({
      title: '加载失败',
      content: '页面加载出错，请检查网络后重试。',
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.retryLoad();
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  onWebviewLoad() {
    if (this._loadTimer) {
      clearTimeout(this._loadTimer);
    }
    this.setData({ loading: false, loadError: false });
  },

  retryLoad() {
    this.setData({
      url: '',
      loading: true,
      loadError: false
    });
    setTimeout(() => {
      this.setData({
        url: app.globalData.webviewUrl
      });
    }, 100);
  },

  onShareAppMessage() {
    return {
      title: '共鸣 - 构音障碍语音识别训练系统',
      path: '/pages/index/index'
    };
  }
});
