/**
 * Volcengine (火山引擎) BigModel ASR WebSocket Binary Protocol Handler
 * 
 * Protocol: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
 * 
 * Binary message format (header_size=1, no sequence):
 *   Bytes 0-3:  header (version|hsize, type|flags, serial|compress, reserved)
 *   Bytes 4-7:  payload_size (uint32 big-endian)
 *   Bytes 8+:   payload
 *
 * Binary message format (header_size=2, with sequence):
 *   Bytes 0-3:  header
 *   Bytes 4-7:  sequence number (int32 big-endian)
 *   Bytes 8-11: payload_size (uint32 big-endian)
 *   Bytes 12+:  payload
 */

// Protocol constants
const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE_1 = 0b0001; // 1 unit = 4 bytes (no sequence field)
const HEADER_SIZE_2 = 0b0010; // 2 units = 8 bytes (with sequence field)

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
 * Build a binary header WITHOUT sequence (header_size=1: 4+4=8 bytes)
 */
function buildHeaderNoSeq(
  messageType: number,
  messageTypeFlags: number,
  serializationMethod: number,
  compressionType: number,
  payloadSize: number
): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, (PROTOCOL_VERSION << 4) | HEADER_SIZE_1);
  view.setUint8(1, (messageType << 4) | messageTypeFlags);
  view.setUint8(2, (serializationMethod << 4) | compressionType);
  view.setUint8(3, 0x00);
  view.setUint32(4, payloadSize, false);
  return buffer;
}

/**
 * Build a binary header WITH sequence (header_size=2: 4+4+4=12 bytes)
 */
function buildHeaderWithSeq(
  messageType: number,
  messageTypeFlags: number,
  serializationMethod: number,
  compressionType: number,
  sequenceNumber: number,
  payloadSize: number
): ArrayBuffer {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, (PROTOCOL_VERSION << 4) | HEADER_SIZE_2);
  view.setUint8(1, (messageType << 4) | messageTypeFlags);
  view.setUint8(2, (serializationMethod << 4) | compressionType);
  view.setUint8(3, 0x00);
  view.setInt32(4, sequenceNumber, false);
  view.setUint32(8, payloadSize, false);
  return buffer;
}

/**
 * Build the full_client_request message (first message with config)
 * Uses NO_SEQUENCE + header_size=1 (server auto-assigns seq=1)
 */
function buildFullClientRequest(
  reqParams: Record<string, unknown>
): ArrayBuffer {
  const jsonPayload = JSON.stringify(reqParams);
  const jsonBytes = new TextEncoder().encode(jsonPayload);

  const header = buildHeaderNoSeq(
    FULL_CLIENT_REQUEST,
    NO_SEQUENCE,
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
 * Build an audio_only_request message with sequence number.
 * 
 * For audio messages with POS_SEQUENCE/NEG_SEQUENCE:
 *   header_size=1, bytes 4-7 = sequence number (NOT payload_size!)
 *   Audio data follows directly at byte 8 with no payload_size field.
 */
function buildAudioOnlyRequest(
  audioData: ArrayBuffer,
  sequenceNumber: number,
  isLast: boolean
): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, (PROTOCOL_VERSION << 4) | HEADER_SIZE_1);
  view.setUint8(1, (AUDIO_ONLY_REQUEST << 4) | (isLast ? NEG_SEQUENCE : POS_SEQUENCE));
  view.setUint8(2, (NO_COMPRESSION << 4) | NO_COMPRESSION);
  view.setUint8(3, 0x00);
  view.setInt32(4, isLast ? -sequenceNumber : sequenceNumber, false);

  const result = new Uint8Array(8 + audioData.byteLength);
  result.set(new Uint8Array(buffer), 0);
  result.set(new Uint8Array(audioData), 8);

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

  const byte0 = view.getUint8(0);
  const headerSize = byte0 & 0x0f; // header size in 4-byte units

  const byte1 = view.getUint8(1);
  const messageType = (byte1 >> 4) & 0x0f;
  const messageTypeFlags = byte1 & 0x0f;

  const byte2 = view.getUint8(2);
  const serializationMethod = (byte2 >> 4) & 0x0f;
  const compressionType = byte2 & 0x0f;

  // Payload size is at offset (headerSize * 4)
  const payloadSizeOffset = headerSize * 4;
  if (data.byteLength < payloadSizeOffset + 4) {
    return { messageType, messageTypeFlags, serializationMethod, compressionType, payload: null };
  }

  const payloadSize = view.getUint32(payloadSizeOffset, false);
  const payloadOffset = payloadSizeOffset + 4;

  let payload: string | null = null;
  if (payloadSize > 0 && data.byteLength >= payloadOffset + payloadSize) {
    const payloadBytes = new Uint8Array(data, payloadOffset, payloadSize);

    if (compressionType === GZIP_COMPRESSION) {
      payload = '[gzip compressed - needs decompression]';
      console.warn('Gzip compression in ASR response not yet handled');
    } else {
      // Decode and strip any trailing null bytes
      payload = new TextDecoder().decode(payloadBytes).replace(/\0+$/, '');
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
  private sequenceCounter: number = 2; // starts at 2 (full_client_request is auto seq=1)

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
   * Connect to the ASR WebSocket service.
   * Returns a Promise that resolves when the connection is open and
   * the initial full_client_request has been sent.
   */
  connect(): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }

    this.sequenceCounter = 2;
    this.setState('connecting');

    const wsUrl = this.config.proxyUrl 
      || `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`;

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          console.log('[ASR] WebSocket connected');
          this.setState('connected');
          this.sendFullClientRequest();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          console.error('[ASR] WebSocket error:', event);
          this.setState('error');
          this.callbacks.onError('WebSocket 连接失败');
          reject(new Error('WebSocket connection failed'));
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
        reject(err);
      }
    });
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
    console.log('[ASR] Sent full_client_request (no explicit sequence)');
  }

  /**
   * Send an audio chunk
   */
  sendAudio(audioData: ArrayBuffer, isLast: boolean = false): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ASR] WebSocket not ready, cannot send audio');
      return;
    }

    const seq = this.sequenceCounter;
    const message = buildAudioOnlyRequest(audioData, seq, isLast);
    this.ws.send(message);
    this.sequenceCounter++;

    if (isLast) {
      console.log('[ASR] Sent last audio chunk (seq=' + (-seq) + ')');
    }
  }

  /**
   * Handle incoming server messages
   */
  private handleMessage(data: ArrayBuffer | Blob | string): void {
    if (typeof data === 'string') {
      console.log('[ASR] Received text message (ignored):', data.slice(0, 100));
      return;
    }

    if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => this.handleBinaryMessage(buf));
      return;
    }

    this.handleBinaryMessage(data);
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    try {
      if (data.byteLength < 4) {
        console.warn('[ASR] Received too-short frame, length:', data.byteLength);
        return;
      }

      const response = parseServerResponse(data);

      if (response.messageType === SERVER_FULL_RESPONSE) {
        if (response.payload) {
          try {
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
          } catch (parseErr) {
            console.warn('[ASR] Could not parse payload JSON:', parseErr, response.payload?.slice(0, 200));
          }
        }
      } else if (response.messageType === SERVER_ACK) {
        console.log('[ASR] Server ACK received');
      } else if (response.messageType === SERVER_ERROR_RESPONSE) {
        console.error('[ASR] Server error:', response.payload);
        this.callbacks.onError(response.payload || '识别服务返回错误');
      } else {
        console.log('[ASR] Unknown message type:', response.messageType);
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
  buildHeaderNoSeq,
  buildHeaderWithSeq,
  buildFullClientRequest,
  buildAudioOnlyRequest,
  parseServerResponse,
  generateUUID,
  constants: {
    PROTOCOL_VERSION,
    HEADER_SIZE_1,
    HEADER_SIZE_2,
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
