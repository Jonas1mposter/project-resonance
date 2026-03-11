import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Detects WeChat Mini Program WebView environment and provides
 * a bridge to native recording capabilities.
 *
 * Communication flow:
 * 1. WebView calls wx.miniProgram.postMessage({ type: 'startRecord' })
 *    then wx.miniProgram.navigateTo to native recording page
 * 2. Native page records → uploads to ASR → stores transcript in globalData
 * 3. On navigateBack, webview.js reloads WebView URL with ?wxTranscript=...
 * 4. This hook reads the query param and provides the transcript
 */

declare global {
  interface Window {
    wx?: {
      miniProgram?: {
        postMessage: (data: { data: Record<string, unknown> }) => void;
        navigateTo: (opts: { url: string }) => void;
        navigateBack: () => void;
      };
    };
    __wxjs_environment?: string;
  }
}

interface WechatBridgeReturn {
  /** Whether we're inside a WeChat Mini Program WebView */
  isWechat: boolean;
  /** Trigger native recording flow */
  startNativeRecording: () => void;
  /** Transcript received from native recording (via URL params) */
  transcript: string | null;
  /** Recording duration from native recording */
  recordDuration: number;
  /** Clear the received transcript */
  clearTranscript: () => void;
}

function isWechatMiniProgram(): boolean {
  // Method 1: __wxjs_environment
  if (window.__wxjs_environment === 'miniprogram') return true;
  // Method 2: User agent
  if (/miniProgram/i.test(navigator.userAgent)) return true;
  // Method 3: wx.miniProgram exists
  if (window.wx?.miniProgram) return true;
  return false;
}

function getWxTranscriptFromUrl(): { transcript: string | null; duration: number } {
  const params = new URLSearchParams(window.location.search);
  const transcript = params.get('wxTranscript');
  const duration = parseFloat(params.get('wxDuration') || '0');
  return { transcript: transcript ? decodeURIComponent(transcript) : null, duration };
}

export function useWechatBridge(): WechatBridgeReturn {
  const [isWechat] = useState(() => isWechatMiniProgram());
  const [transcript, setTranscript] = useState<string | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const initialChecked = useRef(false);

  // On mount or URL change, check for transcript in URL params
  useEffect(() => {
    if (!isWechat) return;

    const { transcript: t, duration: d } = getWxTranscriptFromUrl();
    if (t && !initialChecked.current) {
      setTranscript(t);
      setRecordDuration(d);
      // Clean URL params without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('wxTranscript');
      url.searchParams.delete('wxDuration');
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url.toString());
    }
    initialChecked.current = true;
  }, [isWechat]);

  const startNativeRecording = useCallback(() => {
    if (!isWechat || !window.wx?.miniProgram) return;
    // Reset state
    initialChecked.current = false;
    setTranscript(null);
    setRecordDuration(0);
    // Notify mini program and navigate to recording page
    window.wx.miniProgram.postMessage({ data: { type: 'startRecord' } });
    window.wx.miniProgram.navigateTo({ url: '/pages/record/record' });
  }, [isWechat]);

  const clearTranscript = useCallback(() => {
    setTranscript(null);
    setRecordDuration(0);
  }, []);

  return {
    isWechat,
    startNativeRecording,
    transcript,
    recordDuration,
    clearTranscript,
  };
}
