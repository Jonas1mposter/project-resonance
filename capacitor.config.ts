import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.projectresonance',
  appName: 'project-resonance',
  webDir: 'dist',
  // 开发调试时取消下面注释以启用热更新：
  // server: {
  //   url: 'https://04466494-6b49-4706-b8ad-1d43ad8ca1f3.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
};

export default config;
