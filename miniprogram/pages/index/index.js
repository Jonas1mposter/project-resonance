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

  goRecordDirect() {
    wx.showLoading({ title: '打开录音页...' });

    const paths = ['/pages/record/index', '../record/index'];

    const tryOpen = (index) => {
      if (index >= paths.length) {
        wx.hideLoading();
        wx.showModal({
          title: '打开失败',
          content: '无法进入录音页，请重启小程序后重试',
          showCancel: false,
        });
        return;
      }

      const url = paths[index];

      wx.navigateTo({
        url,
        success: () => {
          wx.hideLoading();
        },
        fail: (err) => {
          console.error('[GoRecord navigateTo failed]:', url, err);
          wx.redirectTo({
            url,
            success: () => wx.hideLoading(),
            fail: (err2) => {
              console.error('[GoRecord redirectTo failed]:', url, err2);
              tryOpen(index + 1);
            },
          });
        },
      });
    };

    tryOpen(0);
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
