import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionWakeDetector } from '../src/voice/wake';

vi.mock('../src/voice/pcm', () => ({ pcm16: async () => new Int16Array(16000).buffer }));

describe('recuperación de escucha local', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('vuelve a escuchar tras dos fallos transitorios de transcripción', async () => {
    const tracks = [{ stop: vi.fn() }];
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({
      getTracks: () => tracks, getAudioTracks: () => tracks,
    }) } });
    vi.stubGlobal('AudioContext', class {
      async resume() {}
      async close() {}
      createAnalyser() {
        const started = performance.now();
        return { fftSize: 1024, getFloatTimeDomainData: (samples: Float32Array) =>
          samples.fill(performance.now() - started < 100 ? 0.2 : 0) };
      }
      createMediaStreamSource() { return { connect: () => {} }; }
    });
    vi.stubGlobal('MediaStream', class { constructor(_tracks: unknown[]) {} });
    vi.stubGlobal('MediaRecorder', class {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio']) });
        this.onstop?.();
      }
    });
    const statuses: string[] = [];
    const fail = vi.fn();
    const transcribe = vi.fn()
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValue('Otra frase');
    const detector = new TranscriptionWakeDetector(transcribe, '', 1,
      status => statuses.push(status), fail);
    try {
      await detector.start(() => {});
      await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(3), { timeout: 12000, interval: 100 });
      await vi.waitFor(() => expect(statuses.at(-1)).toBe('listening'), { timeout: 2000 });
      expect(statuses.filter(status => status === 'recovering')).toHaveLength(2);
      expect(fail).not.toHaveBeenCalled();
    } finally { detector.stop(); }
  }, 15000);
});
