/**
 * Volcengine (火山引擎) BigModel ASR WebSocket Binary Protocol Handler
 * 
 * Protocol: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
 * 
 * Binary message format:
 * - Byte 0: protocol_version (4 bits) | header_size (4 bits)
 * - Byte 1: message_type (4 bits) | message_type_flags (4 bits)
 * - Byte 2: serialization_method (4 bits) | compression_type (4 bits)
 * - Byte 3: reserved (8 bits)
 * - Bytes 4-7: payload_size (uint32, big-endian)
 * - Bytes 8+: payload
 */

// Protocol constants
const PROTOCOL_VERSION = 0b0001;
const DEFAULT_HEADER_SIZE = 0b0001; // 4 bytes

// Message types
const FULL_CLIENT_REQUEST = 0b0001;
const AUDIO_ONLY_REQUEST = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR_RESPONSE = 0b1111;

// Serialization methods
const JSON_SERIALIZATION = 0b0001;

// Compression types
const NO_COMPRESSION = 0b0000;
const GZIP_COMPRESSION = 0b0001;

// Message type flags
const NO_SEQUENCE = 0b0000;
const POS_SEQUENCE = 0b0001; // positive sequence (non-last)
const NEG_SEQUENCE = 0b0010; // negative sequence (last)
const NEG_WITH_SEQUENCE = 0b0011;

export interface ASRConfig {
  appKey: string;
  accessKey: string;
  resourceId: string;
  /** Optional proxy URL for when browser can't set custom WebSocket headers */
  proxyUrl?: string;
}

export interface ASRCallbacks {
  onPartialResult: (text: string) => void;
  onFinalResult: (text: string, utterances: ASRUtterance[]) => void;
  onError: (error: string) => void;
  onStateChange: (state: ASRState) => void;
}

export interface ASRUtterance {
  text: string;
  start_time?: number;
  end_time?: number;
  definite: boolean;
}

export type ASRState = 'idle' | 'connecting' | 'connected' | 'recognizing' | 'error';

/**
 * Build a binary protocol header for the Volcengine ASR service
 */
function buildHeader(
  messageType: number,
  messageTypeFlags: number,
  serializationMethod: number,
  compressionType: number,
  payloadSize: number
): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  // Byte 0: protocol_version (4 bits) | header_size (4 bits)
  view.setUint8(0, (PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE);

  // Byte 1: message_type (4 bits) | message_type_flags (4 bits)
  view.setUint8(1, (messageType << 4) | messageTypeFlags);

  // Byte 2: serialization_method (4 bits) | compression_type (4 bits)
  view.setUint8(2, (serializationMethod << 4) | compressionType);

  // Byte 3: reserved
  view.setUint8(3, 0x00);

  // Bytes 4-7: payload_size (uint32, big-endian)
  view.setUint32(4, payloadSize, false);

  return buffer;
}

/**
 * Build the full_client_request message (first message with config + optional audio)
 */
function buildFullClientRequest(
  reqParams: Record<string, unknown>,
  audioData?: ArrayBuffer
): ArrayBuffer {
  const jsonPayload = JSON.stringify(reqParams);
  const jsonBytes = new TextEncoder().encode(jsonPayload);

  const header = buildHeader(
    FULL_CLIENT_REQUEST,
    audioData ? POS_SEQUENCE : NEG_SEQUENCE,
    JSON_SERIALIZATION,
    NO_COMPRESSION,
    jsonBytes.length
  );

  const result = new Uint8Array(header.byteLength + jsonBytes.length);
  result.set(new Uint8Array(header), 0);
  result.set(jsonBytes, header.byteLength);

  return result.buffer;
}

/**
 * Build an audio_only_request message
 */
function buildAudioOnlyRequest(
  audioData: ArrayBuffer,
  isLast: boolean
): ArrayBuffer {
  const header = buildHeader(
    AUDIO_ONLY_REQUEST,
    isLast ? NEG_SEQUENCE : POS_SEQUENCE,
    NO_COMPRESSION, // no serialization for raw audio
    NO_COMPRESSION,
    audioData.byteLength
  );

  const result = new Uint8Array(header.byteLength + audioData.byteLength);
  result.set(new Uint8Array(header), 0);
  result.set(new Uint8Array(audioData), header.byteLength);

  return result.buffer;
}

/**
 * Parse a server response message
 */
function parseServerResponse(data: ArrayBuffer): {
  messageType: number;
  messageTypeFlags: number;
  serializationMethod: number;
  compressionType: number;
  payload: string | null;
} {
  const view = new DataView(data);

  const byte1 = view.getUint8(1);
  const messageType = (byte1 >> 4) & 0x0f;
  const messageTypeFlags = byte1 & 0x0f;

  const byte2 = view.getUint8(2);
  const serializationMethod = (byte2 >> 4) & 0x0f;
  const compressionType = byte2 & 0x0f;

  const payloadSize = view.getUint32(4, false);

  let payload: string | null = null;
  if (payloadSize > 0) {
    const payloadBytes = new Uint8Array(data, 8, payloadSize);

    if (compressionType === GZIP_COMPRESSION) {
      // Decompress gzip - use DecompressionStream API
      payload = '[gzip compressed - needs decompression]';
      console.warn('Gzip compression in ASR response not yet handled');
    } else {
      payload = new TextDecoder().decode(payloadBytes);
    }
  }

  return { messageType, messageTypeFlags, serializationMethod, compressionType, payload };
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Volcengine ASR WebSocket Client
 * 
 * NOTE: Browser WebSocket API does NOT support custom headers.
 * For production use, a backend proxy is required to forward requests
 * with the proper authentication headers.
 */
export class VolcengineASRClient {
  private ws: WebSocket | null = null;
  private config: ASRConfig;
  private callbacks: ASRCallbacks;
  private state: ASRState = 'idle';
  private connectId: string = '';

  constructor(config: ASRConfig, callbacks: ASRCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  getState(): ASRState {
    return this.state;
  }

  private setState(state: ASRState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  /**
   * Connect to the ASR WebSocket service
   */
  connect(): void {
    if (this.ws) {
      this.disconnect();
    }

    this.connectId = generateUUID();
    this.setState('connecting');

    // Build the WebSocket URL
    // NOTE: In production, this should go through a proxy that adds the auth headers
    const wsUrl = this.config.proxyUrl 
      || `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[ASR] WebSocket connected');
        this.setState('connected');
        this.sendFullClientRequest();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        console.error('[ASR] WebSocket error:', event);
        this.setState('error');
        this.callbacks.onError('WebSocket 连接失败');
      };

      this.ws.onclose = (event) => {
        console.log('[ASR] WebSocket closed:', event.code, event.reason);
        if (this.state !== 'idle') {
          this.setState('idle');
        }
      };
    } catch (err) {
      console.error('[ASR] Failed to create WebSocket:', err);
      this.setState('error');
      this.callbacks.onError('无法创建 WebSocket 连接');
    }
  }

  /**
   * Send the initial full_client_request with configuration
   */
  private sendFullClientRequest(): void {
    const reqParams = {
      user: {
        uid: `web_user_${Date.now()}`,
      },
      audio: {
        format: 'pcm',
        rate: 16000,
        bits: 16,
        channel: 1,
        language: 'zh-CN',
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        result_type: 'single',
        vad_segment_duration: 15000,
      },
    };

    const message = buildFullClientRequest(reqParams);
    this.ws?.send(message);
    this.setState('recognizing');
    console.log('[ASR] Sent full_client_request');
  }

  /**
   * Send an audio chunk
   */
  sendAudio(audioData: ArrayBuffer, isLast: boolean = false): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ASR] WebSocket not ready, cannot send audio');
      return;
    }

    const message = buildAudioOnlyRequest(audioData, isLast);
    this.ws.send(message);

    if (isLast) {
      console.log('[ASR] Sent last audio chunk (negative sequence)');
    }
  }

  /**
   * Handle incoming server messages
   */
  private handleMessage(data: ArrayBuffer): void {
    try {
      const response = parseServerResponse(data);

      if (response.messageType === SERVER_FULL_RESPONSE) {
        if (response.payload) {
          const result = JSON.parse(response.payload);
          console.log('[ASR] Server response:', result);

          const text = result?.result?.text || result?.payload_msg?.result?.text || '';
          const isDefinite = result?.result?.definite === true || 
                             result?.payload_msg?.result?.definite === true;
          const utterances = result?.result?.utterances || 
                            result?.payload_msg?.result?.utterances || [];

          if (isDefinite) {
            this.callbacks.onFinalResult(text, utterances);
          } else {
            this.callbacks.onPartialResult(text);
          }
        }
      } else if (response.messageType === SERVER_ACK) {
        console.log('[ASR] Server ACK received');
      } else if (response.messageType === SERVER_ERROR_RESPONSE) {
        console.error('[ASR] Server error:', response.payload);
        this.callbacks.onError(response.payload || '识别服务返回错误');
      }
    } catch (err) {
      console.error('[ASR] Failed to parse server message:', err);
    }
  }

  /**
   * Disconnect from the ASR service
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('idle');
  }
}

// Export protocol utilities for testing
export const protocol = {
  buildHeader,
  buildFullClientRequest,
  buildAudioOnlyRequest,
  parseServerResponse,
  generateUUID,
  constants: {
    PROTOCOL_VERSION,
    DEFAULT_HEADER_SIZE,
    FULL_CLIENT_REQUEST,
    AUDIO_ONLY_REQUEST,
    SERVER_FULL_RESPONSE,
    SERVER_ACK,
    SERVER_ERROR_RESPONSE,
    JSON_SERIALIZATION,
    NO_COMPRESSION,
    GZIP_COMPRESSION,
    POS_SEQUENCE,
    NEG_SEQUENCE,
  },
};
