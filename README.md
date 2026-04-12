# 共鸣 (Resonance)

面向构音障碍患者的智能语音识别与辅助沟通系统。

## 项目简介

共鸣（Resonance）是一款专为构音障碍（Dysarthria）患者设计的语音辅助工具。通过集成多种 ASR（自动语音识别）引擎和 TTS（文字转语音）技术，帮助患者更好地进行日常沟通。

### 核心功能

- **语音识别**：支持 Whisper ASR（自部署）和浏览器原生识别，自动降级切换
- **语音合成**：支持 CosyVoice TTS（含声音克隆）和 Web Speech API
- **短语管理**：预设 10 大生活场景分类（生理需求、照护协助、疼痛不适等）
- **无障碍设计**：键盘快捷键、屏幕阅读器支持、运动障碍适配
- **跨平台**：Web 应用 + 微信小程序 + iOS/Android（Capacitor）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| UI 组件 | shadcn/ui + Tailwind CSS 3 |
| 路由 | React Router v6 |
| 状态管理 | TanStack React Query + localStorage |
| 表单 | React Hook Form + Zod |
| 动画 | Framer Motion |
| 后端/认证 | Supabase (PostgreSQL + Auth) |
| ASR 引擎 | Whisper（自部署） / 浏览器原生 |
| TTS 引擎 | CosyVoice（含声音克隆） / Web Speech API |
| 移动端 | Capacitor (iOS/Android) |
| 测试 | Vitest + Testing Library |
| 代码检查 | ESLint 9 |

## 项目结构

```
project-resonance/
├── src/                    # 前端源代码
│   ├── components/         # UI 组件（含 shadcn/ui）
│   ├── pages/              # 页面组件
│   ├── hooks/              # 自定义 React Hooks
│   ├── services/           # 外部服务集成
│   ├── types/              # TypeScript 类型定义
│   ├── data/               # 静态数据（默认短语等）
│   └── test/               # 测试文件
├── docs/                   # 项目文档
│   ├── specs/              # 规格文档（PRD、测试标准、ADR）
│   ├── research/           # 调研文档（论文分析、技术对比、部署指南）
│   └── design/             # 设计文档（可视化海报）
├── model/                  # Python ML 后端（Whisper 微调）
├── miniprogram/            # 微信小程序
├── supabase/               # Supabase 配置与 Edge Functions
├── scripts/                # 构建/工具脚本
└── public/                 # 静态资源
```

## 快速开始

### 环境要求

- Node.js >= 18
- Bun (推荐) 或 npm

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/Jonas1mposter/project-resonance.git
cd project-resonance

# 安装依赖
bun install
# 或
npm install

# 启动开发服务器
bun run dev
# 或
npm run dev
```

### 常用命令

```bash
bun run dev          # 启动开发服务器
bun run build        # 生产构建
bun run build:dev    # 开发模式构建
bun run test         # 运行测试
bun run test:watch   # 监听模式运行测试
bun run lint         # 代码检查
bun run preview      # 预览生产构建
```

### 环境变量

复制 `.env.example` 为 `.env`，填入以下配置：

```
VITE_SUPABASE_URL=<你的 Supabase URL>
VITE_SUPABASE_ANON_KEY=<你的 Supabase Anon Key>
```

## 文档

- [产品需求文档](docs/specs/prd.md)
- [测试数据标准](docs/specs/test-data-standard.md)
- [ASR 技术路线对比](docs/research/asr-technology-comparison.md)
- [v2 升级实验方案](docs/research/experiment-v2-upgrade.md)

## 团队

共鸣项目由华东师范大学团队开发。

## 许可证

MIT
