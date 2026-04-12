# 变更日志

本项目所有显著变更记录在此文件中。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

### 新增
- Cloudflare Tunnel 替代 ngrok 用于本地 ASR 服务暴露
- Whisper ASR 离线自动降级到浏览器原生识别
- CosyVoice TTS 集成（含声音克隆功能）
- Edge Function: `whisper-asr` — Whisper ASR 代理
- Edge Function: `cosyvoice-tts` — CosyVoice TTS 代理
- ASR 状态自动检测（ping 探测）
- 项目文档结构规范化（docs/specs, docs/research, docs/design）

### 变更
- ASR 引擎从 Stepfun API 切换到自部署 Whisper
- TTS 引擎从 Stepfun TTS 切换到 CosyVoice
- 移除 Volcengine ASR 集成
- 移除 Stepfun ASR/TTS/Voice Clone 相关代码和 Edge Functions

### 修复
- Edge Function 错误处理和弹性改进
- Gradio API SSE 处理稳定性提升

## [0.1.0] - 2026-03-17

### 新增
- 初始版本发布
- React 18 + TypeScript + Vite + Tailwind + shadcn/ui 技术栈
- Supabase 认证和数据存储
- 10 大生活场景短语分类
- 录音训练界面
- 语音识别使用界面
- 无障碍功能（键盘快捷键、屏幕阅读器支持）
- 微信小程序版本
- Capacitor 移动端支持（iOS/Android）
