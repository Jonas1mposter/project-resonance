import { useState, useCallback, useRef, useEffect } from 'react';
import type { ASRConfig, ASRState, ASRUtterance } from '@/services/volcengineASR';
import { VolcengineASRClient } from '@/services/volcengineASR';

interface UseVolcengineASROptions {
  config: ASRConfig;
  /** Enable mock mode (simulates ASR results without real API) */
  mockMode?: boolean;
  /** Phrases for mock mode to randomly return */
  mockPhrases?: string[];
}

interface UseVolcengineASRReturn {
  /** Current ASR state */
  state: ASRState;
  /** Partial (interim) recognition text */
  partialText: string;
  /** Final recognized text */
  finalText: string;
  /** All utterances from the final result */
  utterances: ASRUtterance[];
  /** Error message if any */
  error: string | null;
  /** Start streaming ASR session */
  startSession: () => Promise<void>;
  /** Send PCM audio data to ASR */
  sendAudio: (audioData: ArrayBuffer, isLast?: boolean) => void;
  /** Stop the ASR session */
  stopSession: () => void;
  /** Reset all state */
  reset: () => void;
  /** Whether ASR is actively recognizing */
  isRecognizing: boolean;
}

// Mock phrases for testing
const DEFAULT_MOCK_PHRASES = [
  '我想喝水',
  '帮我翻身',
  '我感觉不舒服',
  '谢谢你',
  '我需要上厕所',
  '请帮我开灯',
  '我饿了',
  '你好',
  '我想出去走走',
  '请叫医生来',
];

/**
 * Simulate streaming ASR with progressive text reveal
 */
function simulateMockASR(
  phrase: string,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  abortSignal: AbortSignal
): void {
  const chars = Array.from(phrase); // handle multi-byte chars
  let currentIndex = 0;

  const interval = setInterval(() => {
    if (abortSignal.aborted) {
      clearInterval(interval);
      return;
    }

    currentIndex++;
    if (currentIndex < chars.length) {
      onPartial(chars.slice(0, currentIndex).join(''));
    } else {
      clearInterval(interval);
      onFinal(phrase);
    }
  }, 120 + Math.random() * 80); // 120-200ms per char for realism
}

export function useVolcengineASR({
  config,
  mockMode = true,
  mockPhrases = DEFAULT_MOCK_PHRASES,
}: UseVolcengineASROptions): UseVolcengineASRReturn {
  const [state, setState] = useState<ASRState>('idle');
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [utterances, setUtterances] = useState<ASRUtterance[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<VolcengineASRClient | null>(null);
  const mockAbortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      mockAbortRef.current?.abort();
      cleanupAudioCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupAudioCapture = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  /**
   * Convert Float32Array PCM to Int16 PCM ArrayBuffer
   */
  const float32ToInt16 = useCallback((float32: Float32Array): ArrayBuffer => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16.buffer;
  }, []);

  /**
   * Start capturing audio from microphone and streaming to ASR
   */
  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessorNode to get raw PCM chunks
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = float32ToInt16(new Float32Array(inputData));

        if (clientRef.current) {
          clientRef.current.sendAudio(pcmData, false);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      console.error('[ASR] Microphone access error:', err);
      setError('无法访问麦克风，请检查权限设置');
      setState('error');
    }
  }, [float32ToInt16]);

  const startSession = useCallback(async () => {
    setError(null);
    setPartialText('');
    setFinalText('');
    setUtterances([]);

    if (mockMode) {
      // Mock mode: simulate streaming recognition
      setState('recognizing');

      const randomPhrase = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
      const abortController = new AbortController();
      mockAbortRef.current = abortController;

      // Small delay to simulate connection
      await new Promise((r) => setTimeout(r, 300));

      if (abortController.signal.aborted) return;

      simulateMockASR(
        randomPhrase,
        (text) => {
          if (!abortController.signal.aborted) {
            setPartialText(text);
          }
        },
        (text) => {
          if (!abortController.signal.aborted) {
            setFinalText(text);
            setPartialText('');
            setUtterances([{ text, definite: true }]);
            setState('idle');
          }
        },
        abortController.signal
      );
    } else {
      // Real mode: connect to Volcengine ASR
      const client = new VolcengineASRClient(config, {
        onPartialResult: (text) => setPartialText(text),
        onFinalResult: (text, utts) => {
          setFinalText(text);
          setPartialText('');
          setUtterances(utts);
        },
        onError: (err) => setError(err),
        onStateChange: (s) => setState(s),
      });

      clientRef.current = client;

      try {
        // Wait for WebSocket to connect and send config before capturing audio
        await client.connect();
        // Only start audio capture after connection is ready
        await startAudioCapture();
      } catch (err) {
        console.error('[ASR] Connection failed:', err);
        // Error state already set by client callbacks
      }
    }
  }, [mockMode, mockPhrases, config, startAudioCapture]);

  const sendAudio = useCallback((audioData: ArrayBuffer, isLast: boolean = false) => {
    if (clientRef.current) {
      clientRef.current.sendAudio(audioData, isLast);
    }
  }, []);

  const stopSession = useCallback(() => {
    if (mockMode) {
      mockAbortRef.current?.abort();
      // In mock mode, if we stop early, generate a quick final result
      if (state === 'recognizing' && !finalText) {
        const currentPartial = partialText || mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
        setFinalText(currentPartial);
        setPartialText('');
        setUtterances([{ text: currentPartial, definite: true }]);
      }
      setState('idle');
    } else {
      // Send last audio chunk with negative sequence
      if (clientRef.current) {
        clientRef.current.sendAudio(new ArrayBuffer(0), true);
      }
      cleanupAudioCapture();

      // Wait for final result or timeout before disconnecting
      // Upstream proxy needs ~3s to connect + processing time
      const maxWait = 8000;
      const checkInterval = 200;
      let waited = 0;

      const waitForResult = setInterval(() => {
        waited += checkInterval;
        // Disconnect if we got a final result or timed out
        if (finalText || waited >= maxWait) {
          clearInterval(waitForResult);
          if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
          }
        }
      }, checkInterval);
    }
  }, [mockMode, state, finalText, partialText, mockPhrases, cleanupAudioCapture]);

  const reset = useCallback(() => {
    mockAbortRef.current?.abort();
    clientRef.current?.disconnect();
    clientRef.current = null;
    cleanupAudioCapture();
    setState('idle');
    setPartialText('');
    setFinalText('');
    setUtterances([]);
    setError(null);
  }, [cleanupAudioCapture]);

  return {
    state,
    partialText,
    finalText,
    utterances,
    error,
    startSession,
    sendAudio,
    stopSession,
    reset,
    isRecognizing: state === 'recognizing',
  };
}
