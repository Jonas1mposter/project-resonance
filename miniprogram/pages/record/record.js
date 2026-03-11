const app = getApp();
const recorderManager = wx.getRecorderManager();

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

  onLoad(options) {
    this.setData({
      voiceCloned: !!app.globalData.voiceCloned,
    });
    this._setupRecorder();
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
    if (this.data.state === 'recording') {
      recorderManager.stop();
    }
  },

  _setupRecorder() {
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
    recorderManager.stop();
  },

  _processRecording(filePath) {
    this.setData({ state: 'processing', statusText: '正在识别语音...' });

    // Upload to StepFun ASR edge function
    wx.uploadFile({
      url: `${SUPABASE_URL}/functions/v1/stepfun-asr`,
      filePath: filePath,
      name: 'file',
      formData: { model: 'step-asr' },
      header: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      success: (res) => {
        console.log('[ASR] Response:', res.data);
        try {
          const data = JSON.parse(res.data);
          const text = (data.text || '').trim();
          if (text) {
            this.setData({ state: 'result', transcript: text });
          } else {
            this.setData({ state: 'result', transcript: '' });
          }
        } catch (e) {
          console.error('[ASR] Parse error:', e);
          this.setData({
            state: 'error',
            errorMsg: '识别结果解析失败',
          });
        }
      },
      fail: (err) => {
        console.error('[ASR] Upload error:', err);
        this.setData({
          state: 'error',
          errorMsg: '网络请求失败，请检查网络连接',
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
});
