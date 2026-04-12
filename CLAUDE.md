# 共鸣 (Resonance) — AI 行为指南

本文件为 AI 编码助手（如 Claude Code）提供项目上下文和行为规范。

## 项目概述

共鸣是面向构音障碍患者的语音辅助沟通系统，前端使用 React 18 + TypeScript + Vite + Tailwind + shadcn/ui，后端使用 Supabase。

## 技术规范

- **语言**：TypeScript (strict mode)
- **包管理器**：Bun（首选）或 npm
- **代码风格**：ESLint 9 配置，遵循项目 eslint.config.js
- **组件库**：shadcn/ui (Radix UI primitives)，新增 UI 组件优先使用 shadcn/ui
- **样式**：Tailwind CSS，避免内联样式和 CSS modules
- **状态管理**：服务端状态用 TanStack React Query，客户端状态用 localStorage（通过 useAppData hook）
- **路由**：React Router v6，懒加载页面组件
- **表单**：React Hook Form + Zod 验证

## 目录约定

```
src/components/    → 可复用 UI 组件
src/pages/         → 页面级组件（对应路由）
src/hooks/         → 自定义 React Hooks
src/services/      → 外部 API 服务封装
src/types/         → 共享 TypeScript 类型
src/data/          → 静态数据和配置
```

## 关键架构决策

1. **ASR 双引擎**：Whisper（自部署，通过 Supabase Edge Function 代理）为主，浏览器原生 Web Speech API 为降级方案
2. **TTS 双引擎**：CosyVoice（含声音克隆）为主，Web Speech API 为降级方案
3. **无障碍优先**：所有交互组件必须支持键盘操作和屏幕阅读器
4. **离线降级**：当远程 ASR 服务不可用时，自动切换到浏览器原生识别

## 文档管理

项目文档按以下结构组织：

- `docs/specs/` — 规格文档（PRD、测试标准、技术决策记录）
- `docs/research/` — 调研文档（论文分析、技术对比、部署指南）
- `docs/design/` — 设计文档（可视化海报、UI 设计）

### 文档规则

- 新增技术决策记录放入 `docs/specs/decisions/`，格式：`NNNN-标题.md`
- 新增调研文档放入 `docs/research/`
- 变更日志更新到 `CHANGELOG.md`

## 注意事项

- **不要**提交 `.env` 文件
- **不要**修改 `supabase/` 下的数据库迁移文件，除非明确需要
- **不要**删除 `public/docs/` 下的文件（保留历史兼容）
- 新增 Supabase Edge Function 需遵循现有 `supabase/functions/` 目录结构
- 短语分类定义在 `src/data/defaultPhrases.ts`，修改需同步更新类型定义
