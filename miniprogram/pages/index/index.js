const app = getApp();

Page({
  data: {
    version: '1.0.0'
  },

  enterApp() {
    wx.showLoading({ title: '加载中...' });
    wx.navigateTo({
      url: '/pages/webview/webview',
      success() {
        wx.hideLoading();
      },
      fail(err) {
        wx.hideLoading();
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
        console.error('[Navigate Error]', err);
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '共鸣 - 构音障碍语音识别训练系统',
      path: '/pages/index/index',
      imageUrl: '/assets/share-cover.png'
    };
  },

  onShareTimeline() {
    return {
      title: '共鸣 - 为重度构音障碍者设计的语音识别训练系统',
      imageUrl: '/assets/share-cover.png'
    };
  }
});
