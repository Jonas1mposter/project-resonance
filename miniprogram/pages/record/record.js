const app = getApp();
let recorderManager = null;

// Edge function URL for ASR
const SUPABASE_URL = 'https://lwusdbovydwbltxmpctr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3dXNkYm92eWR3Ymx0eG1wY3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzE1MDYsImV4cCI6MjA4NjIwNzUwNn0.0NtvfE3tUFghE6HNDt9MV6r4xaEt_Nga9aQlHFtbokw';

Page({
  data: {
    state: 'idle', // idle | recording | processing | result | error
    duration: 0,
    formatDuration: '0:00',
    transcript: '',
    statusText: '',
    errorMsg: '',
    voiceCloned: false,
  },

  onLoad() {
    this.setData({
      voiceCloned: !!app.globalData.voiceCloned,
    });
    this._initRecorder();
  },

  onUnload() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    if (this.data.state === 'recording' && recorderManager) {
      recorderManager.stop();
    }
  },

  _initRecorder() {
    try {
      if (!wx.getRecorderManager) {
        throw new Error('RecorderManager API 不可用');
      }

      recorderManager = wx.getRecorderManager();
      this._setupRecorder();
    } catch (error) {
      console.error('[Record] init recorder failed:', error);
      this.setData({
        state: 'error',
        errorMsg: '当前环境暂不支持录音，请在真机微信中重试',
      });
    }
  },

  _setupRecorder() {
    if (!recorderManager) return;

    recorderManager.onStart(() => {
      console.log('[Record] Started');
      this._startTime = Date.now();
      this._timer = setInterval(() => {
        const duration = Math.floor((Date.now() - this._startTime) / 1000);
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        this.setData({
          duration,
          formatDuration: `${mins}:${secs.toString().padStart(2, '0')}`,
        });
      }, 200);
    });

    recorderManager.onStop((res) => {
      console.log('[Record] Stopped, tempFilePath:', res.tempFilePath);
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }

      const finalDuration = (Date.now() - this._startTime) / 1000;
      if (finalDuration < 0.5) {
        this.setData({ state: 'idle' });
        wx.showToast({ title: '录音时间太短', icon: 'none' });
        return;
      }

      this._tempFilePath = res.tempFilePath;
      this._recordDuration = finalDuration;
      this._processRecording(res.tempFilePath);
    });

    recorderManager.onError((err) => {
      console.error('[Record] Error:', err);
      if (this._timer) clearInterval(this._timer);
      this.setData({
        state: 'error',
        errorMsg: '录音失败: ' + (err.errMsg || '未知错误'),
      });
    });
  },

  startRecord() {
    if (!recorderManager) {
      this.setData({
        state: 'error',
        errorMsg: '录音组件初始化失败，请重试',
      });
      return;
    }

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ state: 'recording', duration: 0, formatDuration: '0:00' });
        recorderManager.start({
          duration: 120000, // max 2 minutes
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3',
        });
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限',
          content: '请在设置中允许录音权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          },
        });
      },
    });
  },

  stopRecord() {
    if (!recorderManager) return;
    recorderManager.stop();
  },

  _processRecording(filePath, retryCount) {
    retryCount = retryCount || 0;
    this.setData({ state: 'processing', statusText: retryCount > 0 ? `正在重试识别 (${retryCount}/2)...` : '正在识别语音...' });

    // Try Whisper first, fallback to Gemini
    this._tryWhisperASR(filePath, retryCount);
  },

  _tryWhisperASR(filePath, retryCount) {
    console.log('[ASR] Trying Whisper:', `${SUPABASE_URL}/functions/v1/stepfun-asr`);

    wx.uploadFile({
      url: `${SUPABASE_URL}/functions/v1/stepfun-asr`,
      filePath: filePath,
      name: 'file',
      formData: { model: 'step-asr' },
      header: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        console.log('[ASR] Whisper statusCode:', res.statusCode, 'data:', res.data);
        try {
          const data = JSON.parse(res.data);

          if (data.error || data.ok === false) {
            const status = data.status || res.statusCode;
            if ((status === 503 || status === 502) && retryCount < 2) {
              console.log('[ASR] Service unavailable, retrying in 2s...');
              setTimeout(() => this._tryWhisperASR(filePath, retryCount + 1), 2000);
              return;
            }
            // Whisper failed, try Gemini
            console.log('[ASR] Whisper failed, falling back to Gemini...');
            this.setData({ statusText: '正在切换 Gemini 识别...' });
            this._tryGeminiASR(filePath);
            return;
          }

          const text = (data.text || '').trim();
          if (text) {
            this.setData({ state: 'result', transcript: text });
            this._collectCorpus(filePath, text);
          } else {
            this.setData({ state: 'result', transcript: '（未识别到语音内容）' });
          }
        } catch (e) {
          console.error('[ASR] Parse error:', e);
          this._tryGeminiASR(filePath);
        }
      },
      fail: (err) => {
        console.error('[ASR] Whisper upload error:', JSON.stringify(err));
        // Network error, try Gemini
        this.setData({ statusText: '正在切换 Gemini 识别...' });
        this._tryGeminiASR(filePath);
      },
    });
  },

  _tryGeminiASR(filePath) {
    console.log('[ASR] Trying Gemini:', `${SUPABASE_URL}/functions/v1/gemini-asr`);

    wx.uploadFile({
      url: `${SUPABASE_URL}/functions/v1/gemini-asr`,
      filePath: filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        console.log('[ASR] Gemini statusCode:', res.statusCode, 'data:', res.data);
        try {
          const data = JSON.parse(res.data);
          if (data.ok && data.text) {
            const text = data.text.trim();
            if (text) {
              this.setData({ state: 'result', transcript: text });
              this._collectCorpus(filePath, text);
              return;
            }
          }
          this.setData({ state: 'result', transcript: '（未识别到语音内容）' });
        } catch (e) {
          console.error('[ASR] Gemini parse error:', e);
          this.setData({
            state: 'error',
            errorMsg: '所有识别服务均不可用，请稍后重试',
          });
        }
      },
      fail: (err) => {
        console.error('[ASR] Gemini upload error:', JSON.stringify(err));
        this.setData({
          state: 'error',
          errorMsg: '所有识别服务均不可用，请检查网络',
        });
      },
    });
  },

  confirmResult() {
    const { transcript } = this.data;
    // Store result in globalData for WebView to pick up
    app.globalData.lastTranscript = transcript;
    app.globalData.lastRecordFilePath = this._tempFilePath || '';
    app.globalData.lastRecordDuration = this._recordDuration || 0;
    app.globalData.hasNewTranscript = true;

    wx.navigateBack();
  },

  retryRecord() {
    this.setData({
      state: 'idle',
      duration: 0,
      formatDuration: '0:00',
      transcript: '',
      errorMsg: '',
    });
  },

  goBack() {
    wx.navigateBack();
  },

  /**
   * Auto-collect corpus: upload audio + insert record to Supabase
   */
  _collectCorpus(filePath, transcript) {
    const ts = Date.now();
    const fileName = `wx_corpus_${ts}.mp3`;
    const storagePath = `corpus/${fileName}`;
    const durationMs = Math.round((this._recordDuration || 0) * 1000);

    // Upload audio file to storage
    wx.uploadFile({
      url: `${SUPABASE_URL}/storage/v1/object/dysarthria-audio/${storagePath}`,
      filePath: filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-upsert': 'false',
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Insert metadata record
          wx.request({
            url: `${SUPABASE_URL}/rest/v1/dysarthria_recordings`,
            method: 'POST',
            header: {
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            data: {
              file_name: fileName,
              storage_path: storagePath,
              label: transcript,
              category: 'usage-collected',
              duration_ms: durationMs,
              metadata: {
                source: 'wechat-miniprogram',
                collected_at: new Date().toISOString(),
              },
            },
            success: () => console.log('[Corpus] Collected:', fileName),
            fail: (err) => console.warn('[Corpus] Insert failed:', err),
          });
        } else {
          console.warn('[Corpus] Upload failed:', res.statusCode, res.data);
        }
      },
      fail: (err) => console.warn('[Corpus] Upload error:', err),
    });
  },
});
