

## Plan: 清理 StepFun & 火山引擎代码，放占位符

### 概述

移除所有 StepFun 和火山引擎（Volcengine）相关代码，将 ASR 替换为占位 hook（等 Whisper 部署后接入）。CosyVoice TTS 保留不动。

### 要删除的文件（6个）

1. `src/hooks/useStepfunASR.ts` — StepFun ASR hook
2. `src/hooks/useStepfunTTS.ts` — StepFun TTS hook
3. `src/hooks/useVolcengineASR.ts` — 火山引擎 ASR hook
4. `src/services/volcengineASR.ts` — 火山引擎 ASR WebSocket 客户端
5. `supabase/functions/stepfun-asr/index.ts` — StepFun ASR 边缘函数
6. `supabase/functions/stepfun-tts/index.ts` — StepFun TTS 边缘函数
7. `supabase/functions/stepfun-voice-clone/index.ts` — StepFun 音色克隆边缘函数
8. `supabase/functions/asr-proxy/index.ts` — 火山引擎 ASR WebSocket 代理

### 要创建的文件（2个）

1. **`src/hooks/useWhisperASR.ts`** — ASR 占位 hook
   - 同 `useStepfunASR` 的接口（`finalText`, `isProcessing`, `error`, `transcribe`, `reset`）
   - `transcribe()` 调用 `${VITE_SUPABASE_URL}/functions/v1/whisper-asr`
   - 未配置时返回友好错误提示："ASR 服务尚未部署"

2. **`supabase/functions/whisper-asr/index.ts`** — Whisper ASR 边缘函数占位
   - 读取 `WHISPER_API_URL` 环境变量
   - 未配置时返回 503 + `"WHISPER_API_URL not configured, service pending deployment"`
   - 已配置时将 multipart audio 转发到 Whisper 服务，返回 `{ text }` JSON

### 要修改的文件（4个）

1. **`src/pages/UsagePage.tsx`**
   - `import { useStepfunASR }` → `import { useWhisperASR }`
   - `useStepfunASR()` → `useWhisperASR()`

2. **`src/types/index.ts`**
   - `ASRSettings.provider` 改为 `'whisper' | 'cosyvoice'`，默认 `'whisper'`
   - 移除 `appKey`, `accessKey`, `resourceId`, `proxyUrl` 等火山引擎字段

3. **`src/components/ASRSettingsPanel.tsx`**
   - 将"阶跃星辰"改为"本地 Whisper（待部署）"
   - 更新描述文案

4. **`src/pages/SettingsPage.tsx`**
   - 无代码变更需要（它引用的 ASRSettingsPanel 会自动更新）

### CosyVoice 说明

CosyVoice TTS 目前的架构：
- **边缘函数** `supabase/functions/cosyvoice-tts/index.ts` 已就绪
- **环境变量** `COSYVOICE_API_URL` 已配置（值为 `http://localhost:8000/`）
- **你需要做的**：在你的 GPU 服务器上运行 CosyVoice FastAPI 服务，监听 8000 端口，暴露 `/inference_zero_shot` 和 `/inference_sft` 两个接口
- 边缘函数从云端调用你的服务器，所以 `localhost:8000` 需要改为你服务器的公网 IP 或内网穿透地址（如 frp/ngrok）。部署好后告诉我新地址，我帮你更新 `COSYVOICE_API_URL`

