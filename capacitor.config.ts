import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.projectresonance',
  appName: 'project-resonance',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#F7F4F0',
      showSpinner: true,
      spinnerColor: '#4A9E94',
      androidSpinnerStyle: 'small',
    },
  },
  // 开发调试时取消下面注释以启用热更新：
  // server: {
  //   url: 'https://04466494-6b49-4706-b8ad-1d43ad8ca1f3.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
};

export default config;
