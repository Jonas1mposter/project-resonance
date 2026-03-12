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
        navigateTo: (opts: {
          url: string;
          success?: () => void;
          fail?: (err: unknown) => void;
        }) => void;
        redirectTo?: (opts: {
          url: string;
          success?: () => void;
          fail?: (err: unknown) => void;
        }) => void;
        navigateBack: () => void;
        getEnv?: (callback: (res: { miniprogram?: boolean }) => void) => void;
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

function isWechatMiniProgramSync(): boolean {
  // Reliable sync checks only
  if (window.__wxjs_environment === 'miniprogram') return true;
  if (/miniProgram/i.test(navigator.userAgent)) return true;
  return false;
}

function getWxTranscriptFromUrl(): { transcript: string | null; duration: number } {
  const params = new URLSearchParams(window.location.search);
  const transcript = params.get('wxTranscript');
  const duration = parseFloat(params.get('wxDuration') || '0');
  return { transcript: transcript ? decodeURIComponent(transcript) : null, duration };
}

export function useWechatBridge(): WechatBridgeReturn {
  const [isWechat, setIsWechat] = useState(() => isWechatMiniProgramSync());
  const [transcript, setTranscript] = useState<string | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const initialChecked = useRef(false);

  // Async refinement for environments where jweixin exists but not in Mini Program
  useEffect(() => {
    let mounted = true;

    if (isWechatMiniProgramSync()) {
      setIsWechat(true);
      return () => {
        mounted = false;
      };
    }

    try {
      window.wx?.miniProgram?.getEnv?.((res) => {
        if (!mounted) return;
        setIsWechat(!!res?.miniprogram);
      });
    } catch (err) {
      console.warn('[WechatBridge] getEnv check failed:', err);
      if (mounted) setIsWechat(false);
    }

    return () => {
      mounted = false;
    };
  }, []);

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

    // Keep postMessage for compatibility/analytics on mini program side
    window.wx.miniProgram.postMessage({ data: { type: 'startRecord' } });

    const openRecordPage = (url: string, fallback?: () => void) => {
      window.wx?.miniProgram?.navigateTo({
        url,
        fail: (err) => {
          console.error('[WechatBridge] navigateTo failed:', url, err);
          fallback?.();
        },
      });
    };

    // Try absolute path first, then relative path, finally redirectTo fallback
    openRecordPage('/pages/record/record', () => {
      openRecordPage('pages/record/record', () => {
        window.wx?.miniProgram?.redirectTo?.({
          url: '/pages/record/record',
          fail: (err) => {
            console.error('[WechatBridge] redirectTo failed:', err);
          },
        });
      });
    });
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
