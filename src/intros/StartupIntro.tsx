import { useEffect, useState } from 'react';
import type { IntroPayload } from '../../shared/startup-intros';
import { useStore } from '../state/store';
import { PetRenderer } from '../pet/Renderer';
import { IntroRenderer } from './IntroRenderer';

declare global {
  interface Window {
    karenIntro?: { payload(): Promise<IntroPayload>; ready(): Promise<boolean>; finish(): Promise<void> };
  }
}
export function StartupIntro() {
  const [renderer, setRenderer] = useState<IntroRenderer>();
  useEffect(() => {
    let alive = true, controller: IntroRenderer | undefined;
    const native = window.karenIntro;
    const finish = () => { void native?.finish().catch(() => {}); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && controller?.payload.settings.introEscape) finish();
    };
    document.addEventListener('keydown', key);
    const onError = (event: Event) => { console.error('Introducción interrumpida', event instanceof ErrorEvent ? event.message : 'Promesa rechazada'); finish(); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    const pagehide = () => controller?.dispose();
    window.addEventListener('pagehide', pagehide);
    void (async () => {
      if (!native) return;
      const payload = await native.payload();
      if (!alive) return;
      const reduced = payload.settings.introReducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches || !payload.settings.animations;
      controller = new IntroRenderer(payload, reduced, () => native.ready(), finish);
      await controller.audio.prepare(payload.audio);
      payload.audio = undefined;
      if (!alive) { controller.dispose(); return; }
      useStore.setState({ settings: { ...payload.settings, idleActivities: false, cursorTracking: false, particles: false }, ready: true, surfaceVisible: true, native: true });
      setRenderer(controller);
    })().catch(finish);
    return () => {
      alive = false; controller?.dispose();
      document.removeEventListener('keydown', key);
      window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);
  return renderer ? <PetRenderer intro={renderer} className="intro-canvas" /> : null;
}
