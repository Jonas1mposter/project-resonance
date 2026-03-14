const app = getApp();

const RECORD_ROUTE_CANDIDATES = ['pages/record/index', 'pages/record/record'];

function normalizeRoute(route = '') {
  return route.replace(/^\//, '').split('?')[0];
}

function getRegisteredRoutes() {
  try {
    const pages =
      typeof __wxConfig !== 'undefined' && __wxConfig && Array.isArray(__wxConfig.pages)
        ? __wxConfig.pages
        : [];

    return pages.map(normalizeRoute);
  } catch (error) {
    console.error('[Route Debug] read __wxConfig.pages failed:', error);
    return [];
  }
}

function resolveRecordRoute() {
  const registeredRoutes = getRegisteredRoutes();
  const matchedRoute = RECORD_ROUTE_CANDIDATES.find((route) => registeredRoutes.includes(route));

  return {
    targetRoute: matchedRoute || RECORD_ROUTE_CANDIDATES[0],
    registeredRoutes,
  };
}

Page({
  data: {
    version: '1.0.0',
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
          icon: 'none',
        });
        console.error('[Navigate Error]', err);
      },
    });
  },

  goRecordDirect() {
    wx.showLoading({ title: '打开录音页...' });

    const { targetRoute, registeredRoutes } = resolveRecordRoute();
    const url = `/${targetRoute}`;
    const methods = ['navigateTo', 'redirectTo', 'reLaunch'];

    console.log('[GoRecord] Registered routes:', registeredRoutes);
    console.log('[GoRecord] Target route:', url);

    const tryOpen = (index) => {
      if (index >= methods.length) {
        wx.hideLoading();
        wx.showModal({
          title: '打开失败',
          content: `无法进入录音页\n目标: ${url}\n已注册: ${registeredRoutes.join(', ') || '读取失败'}`,
          showCancel: false,
        });
        return;
      }

      const method = methods[index];
      wx[method]({
        url,
        success: () => {
          wx.hideLoading();
        },
        fail: (err) => {
          console.error(`[GoRecord ${method} failed]:`, url, err);
          tryOpen(index + 1);
        },
      });
    };

    tryOpen(0);
  },

  onShareAppMessage() {
    return {
      title: '共鸣 - 构音障碍语音识别训练系统',
      path: '/pages/index/index',
      imageUrl: '/assets/share-cover.png',
    };
  },

  onShareTimeline() {
    return {
      title: '共鸣 - 为重度构音障碍者设计的语音识别训练系统',
      imageUrl: '/assets/share-cover.png',
    };
  },
});
