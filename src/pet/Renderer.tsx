import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite } from "pixi.js";
import "pixi.js/unsafe-eval";
import { createPetTextures } from "./textures";
import { petStyles } from '../../shared/pet-styles';
import { gazeTarget } from "./gaze";
import { machine, signals, useStore } from "../state/store";

function damp(value: number, target: number, dt: number, rate = 9) {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}
export function PetRenderer({
  className = "",
  preview = false,
}: {
  className?: string;
  preview?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const accent = useStore((s) => s.settings.accent);
  const petStyle = useStore((s) => s.settings.petStyle);
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    let app: Application | undefined;
    let observer: ResizeObserver | undefined;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const initialize = async () => {
      app = new Application();
      await app.init({
        width: 380,
        height: 440,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
        powerPreference: "low-power",
        preference: "webgl",
      });
      initialized = true;
      if (disposed) {
        cleanup();
        return;
      }
      host.current!.appendChild(app.canvas);
      app.canvas.setAttribute("aria-hidden", "true");
      const tex = createPetTextures(accent, petStyle);
      const scene = new Container();
      app.stage.addChild(scene);
      const make = (
        texture: typeof tex.body,
        parent: Container,
        anchor = 0.5,
      ) => {
        const s = new Sprite(texture);
        s.anchor.set(anchor);
        parent.addChild(s);
        return s;
      };
      const shadow = make(tex.shadow, scene);
      shadow.y = 142;
      shadow.scale.set(0.9);
      const halo = make(tex.glow, scene);
      halo.scale.set(2.7);
      halo.y = 3;
      halo.alpha = 0.35;
      const root = new Container();
      scene.addChild(root);
      const finL = make(tex.fin, root);
      finL.anchor.set(0.51, 0.9);
      finL.position.set(-72, -62);
      finL.scale.set(0.74, 0.74);
      finL.rotation = -0.35;
      const finR = make(tex.fin, root);
      finR.anchor.set(0.51, 0.9);
      finR.position.set(72, -62);
      finR.scale.set(-0.74, 0.74);
      finR.rotation = 0.35;
      const armL = make(tex.arm, root);
      armL.position.set(-111, 35);
      armL.scale.set(0.65);
      armL.rotation = -0.25;
      const armR = make(tex.arm, root);
      armR.position.set(111, 35);
      armR.scale.set(-0.65, 0.65);
      armR.rotation = 0.25;
      const body = make(tex.body, root);
      body.scale.set(0.94);
      if (!preview) {
        const masks = [body, finL, finR, armL, armR].map((sprite) => {
          const canvas = sprite.texture.source.resource as HTMLCanvasElement;
          return {
            sprite,
            width: canvas.width,
            height: canvas.height,
            data: canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data,
          };
        });
        signals.hitTest = (x, y) =>
          masks.some((m) => {
            const p = m.sprite.toLocal({ x, y });
            const px = Math.floor(p.x + m.sprite.anchor.x * m.width),
              py = Math.floor(p.y + m.sprite.anchor.y * m.height);
            return (
              px >= 0 &&
              py >= 0 &&
              px < m.width &&
              py < m.height &&
              m.data[(py * m.width + px) * 4 + 3] > 90
            );
          });
      }
      const eyes = new Container();
      root.addChild(eyes);
      eyes.y = -7;
      const eyeL = new Container();
      eyes.addChild(eyeL);
      eyeL.x = -44;
      eyeL.scale.set(0.7, 0.7);
      make(tex.eye, eyeL);
      const irisL = make(tex.iris, eyeL);
      const eyeR = new Container();
      eyes.addChild(eyeR);
      eyeR.x = 44;
      eyeR.scale.set(-0.7, 0.7);
      make(tex.eye, eyeR);
      const irisR = make(tex.iris, eyeR);
      const facial = new Graphics();
      root.addChild(facial);
      const sparkles = Array.from({ length: 22 }, (_, i) => {
        const s = make(tex.particle, scene);
        s.scale.set(0.14 + Math.random() * 0.18);
        return {
          sprite: s,
          angle: i * 2.3999,
          radius: 130 + Math.random() * 65,
          speed: 0.12 + Math.random() * 0.25,
          phase: Math.random() * 6.28,
        };
      });
      const resize = () => {
        if (!app || !host.current) return;
        const { width, height } = host.current.getBoundingClientRect();
        app.renderer.resize(width, height);
        scene.position.set(width / 2, height * 0.54);
        scene.scale.set(Math.min(width / 380, height / 440) * (preview ? 0.5 : 0.8));
        // Resizing clears WebGL even while Windows has paused the hidden ticker.
        // Draw this frame immediately; no background animation loop is needed.
        app.render();
      };
      observer = new ResizeObserver(resize);
      observer.observe(host.current!);
      resize();
      let t = 0,
        blink = 0,
        nextBlink = 2 + Math.random() * 4,
        eyeOpen = 1,
        rightOpen = 1,
        tilt = 0,
        mouth = 0,
        float = 0,
        eyeX = 0,
        eyeY = 0,
        brow = 0,
        frames = 0,
        frameTime = 0,
        quality = 1;
      const visibility = () => {
        if (document.hidden) app?.stop();
        else app?.start();
      };
      document.addEventListener("visibilitychange", visibility);
      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.06);
        t += dt;
        const { settings: s, state, expression: spokenExpression } = useStore.getState();
        const sleeping = state === "SLEEPING";
        app!.ticker.maxFPS = s.lowPower || sleeping ? 15 : preview ? 30 : 60;
        frames++;
        frameTime += dt;
        if (frameTime > 3) {
          signals.fps = Math.round(frames / frameTime);
          if (signals.fps < 24 && !s.lowPower && !sleeping) quality = 0.5;
          frames = 0;
          frameTime = 0;
        }
        const motion = s.animations && !reduced.matches;
        const speaking = state === "SPEAKING";
        const expression = speaking ? spokenExpression : state;
        const laughing = expression === 'LAUGHING';
        const angry = expression === 'ANGRY';
        const sad = expression === 'SAD';
        const surprised = expression === 'SURPRISED';
        const proud = expression === 'PROUD';
        const curious = expression === 'CURIOUS';
        const expressiveAge = Math.max(0, (Date.now() - machine.snapshot.since) / 1000);
        const entrance = motion ? Math.max(0, 1 - expressiveAge / 0.7) : 0;
        const voiceEnergy = speaking ? Math.sqrt(Math.max(0, Math.min(1, signals.energy))) : 0;
        if (preview) scene.scale.set(Math.min(app!.screen.width / 380, app!.screen.height / 440) * 0.5 * s.scale);
        const activity = motion ? s.activity : 0;
        let targetTilt =
          state === "CONFUSED"
            ? -0.19
            : state === "THINKING"
              ? 0.1
              : state === "DRAGGING"
                ? 0.16
                : curious ? -0.13
                : angry ? -0.08
                : sad ? 0.13
                : surprised ? 0.06
                : 0;
        const gaze = gazeTarget(signals.cursor, s.cursorTracking && !sleeping);
        if (motion) targetTilt += Math.sin(t * 0.6) * 0.022 + gaze.x * 0.002 + (speaking ? Math.sin(t * 4) * voiceEnergy * 0.035 : 0);
        tilt = damp(tilt, motion ? targetTilt : 0, dt, 7);
        root.rotation = tilt;
        const bob =
          activity *
          (sleeping
            ? Math.sin(t * 0.6) * 2
            : Math.sin(t * 1.65) * 6 + Math.sin(t * 0.7) * 2);
        const happy = expression === "HAPPY" && motion ? Math.max(0, Math.sin(t * 7)) * -13 : 0;
        const laughBounce = laughing && motion ? Math.max(0, Math.sin(t * 12)) * -10 : 0;
        const proudLift = proud && motion ? -7 : 0;
        const surpriseLift = surprised && motion ? -12 * entrance : 0;
        float = damp(
          float,
          bob +
            happy +
            laughBounce + proudLift + surpriseLift +
            (motion && state === "LISTENING" ? -5 : 0) +
            (motion && state === "DRAGGING" ? -12 : 0),
          dt,
          9,
        );
        root.y = float;
        const breathe =
          1 + (motion ? Math.sin(t * (sleeping ? 1.2 : 2.3)) * 0.009 : 0);
        const voicePulse = motion ? voiceEnergy * 0.028 : 0;
        root.scale.set(breathe - voicePulse, 2 - breathe + voicePulse);
        root.alpha = damp(
          root.alpha,
          (sleeping ? 0.57 : 1) * (s.nightMode ? 0.7 : 1) * s.opacity,
          dt,
          3,
        );
        body.tint = state === "ERROR" ? 0xffceb3 : angry ? 0xffd5ce : sad ? 0xdce7ff : 0xffffff;
        halo.alpha =
          (sleeping ? 0.08 : 0.22 + voiceEnergy * 0.07) * s.brightness * (s.nightMode ? 0.6 : 1);
        halo.tint = state === "ERROR" ? 0xffb473 : angry ? 0xff8b7a : sad ? 0x96adff : proud ? 0xffd78c : 0xffffff;
        shadow.scale.set(0.85 - float * 0.002, 0.85 - float * 0.002);
        shadow.alpha = 0.65 - float * 0.009;
        finL.rotation = damp(
          finL.rotation,
          -0.35 +
            (state === "LISTENING"
              ? 0.25
              : sleeping
                ? -0.25
                : state === "CONFUSED"
                  ? -0.3
                  : angry ? -0.42
                  : sad ? -0.35
                  : surprised ? 0.32
                  : 0) +
            Math.sin(t * 1.7) * 0.04 * activity - (motion ? voiceEnergy * 0.1 : 0),
          dt,
          7,
        );
        finR.rotation = damp(
          finR.rotation,
          0.35 +
            (state === "LISTENING"
              ? -0.25
              : sleeping
                ? 0.25
                : state === "CONFUSED"
                  ? -0.13
                  : angry ? 0.42
                  : sad ? 0.35
                  : surprised ? -0.32
                  : 0) -
            Math.sin(t * 1.7 + 0.6) * 0.04 * activity + (motion ? voiceEnergy * 0.1 : 0),
          dt,
          7,
        );
        armL.rotation =
          -0.25 +
          Math.sin(t * 2 + 0.3) * 0.07 * activity +
          (motion ? laughing ? -0.42 : proud ? -0.36 : angry ? 0.2 : sad ? 0.12 : expression === "HAPPY" ? -0.25 : 0 : 0);
        armR.rotation =
          0.25 -
          Math.sin(t * 2) * 0.07 * activity +
          (motion ? laughing ? 0.42 : proud ? 0.36 : angry ? -0.2 : sad ? -0.12 : expression === "HAPPY" ? 0.25 : 0 : 0);
        if (t > nextBlink && !sleeping) {
          blink = 0.16;
          nextBlink = t + 2.5 + Math.random() * 5.5;
        }
        blink = Math.max(0, blink - dt);
        const targetOpen = sleeping
          ? 0.04
          : blink > 0
            ? Math.max(0.04, Math.abs(blink - 0.08) / 0.08)
            : laughing ? 0.37
              : angry ? 0.58
              : sad ? 0.65
              : surprised ? 1.28
              : curious ? 1.12
              : expression === "HAPPY"
              ? 0.68
              : state === "LISTENING"
                ? 1.13
                : state === "ERROR" ? 0.85 : 1;
        const asymmetry = !sleeping && blink === 0 && (state === "CONFUSED" || state === "THINKING" || curious);
        eyeOpen = damp(eyeOpen, targetOpen * (asymmetry ? 0.73 : 1), dt, blink > 0 ? 60 : 12);
        rightOpen = damp(rightOpen, targetOpen * (asymmetry ? 1.08 : 1), dt, blink > 0 ? 60 : 12);
        // Pursuit is damped, not restarted by each cursor event. Reduced motion
        // keeps a legible gaze but removes face translation and head sway.
        eyeX = damp(eyeX, gaze.x, dt, reduced.matches ? 18 : 12);
        eyeY = damp(eyeY, gaze.y, dt, reduced.matches ? 18 : 12);
        eyes.position.set(motion ? eyeX * 0.2 : 0, -7 + (motion ? eyeY * 0.16 : 0));
        irisL.position.set(3 + eyeX, 6 + eyeY);
        irisR.position.set(3 - eyeX, 6 + eyeY);
        eyeL.scale.y = 0.7 * eyeOpen;
        eyeR.scale.y = 0.7 * rightOpen;
        eyeL.rotation = damp(eyeL.rotation, laughing || expression === "HAPPY" ? -0.1 : angry ? 0.13 : state === "CONFUSED" ? -0.08 : 0, dt, 12);
        eyeR.rotation = damp(eyeR.rotation, laughing || expression === "HAPPY" ? 0.1 : angry ? -0.13 : 0, dt, 12);
        mouth = damp(mouth, voiceEnergy * (motion ? 1 : 0.35), dt, voiceEnergy > mouth ? 22 : 12);
        facial.clear();
        if (sleeping) {
          for (const x of [-44, 44])
            facial
              .moveTo(x - 18, -4)
              .quadraticCurveTo(x, 6, x + 18, -4)
              .stroke({ color: 0x9cecf6, width: 3, cap: "round" });
        }
        if (mouth > 0.045) {
          facial.ellipse(0, 41, 7 + mouth * 8, 3 + mouth * 17).fill(0x14223f);
          facial
            .ellipse(0, 47 + mouth * 7, 4 + mouth * 4, 2 + mouth * 4)
            .fill({ color: 0xb9bcf8, alpha: 0.8 });
        } else if (laughing) {
          facial.ellipse(0, 43, 13, 9).fill(0x14223f);
          facial.moveTo(-8, 46).quadraticCurveTo(0, 51, 8, 46).stroke({ color: 0xcdfaff, width: 2, cap: 'round' });
        } else if (surprised) {
          facial.ellipse(0, 43, 6, 10).fill(0x14223f);
        } else if (angry) {
          facial.moveTo(-11, 48).quadraticCurveTo(0, 39, 11, 48).stroke({ color: 0xcdfaff, width: 3, cap: 'round' });
        } else if (sad || state === "ERROR" || state === "CONFUSED") {
          facial
            .moveTo(-9, 44)
            .quadraticCurveTo(0, 35, 9, 44)
            .stroke({ color: 0xcdfaff, width: 3, cap: "round" });
        } else {
          facial
            .moveTo(-12, 36)
            .quadraticCurveTo(0, proud ? 53 : expression === "HAPPY" ? 54 : 46, 12, 36)
            .stroke({ color: 0xcdfaff, width: 3, cap: "round" });
        }
        brow = damp(brow, state === "LISTENING" ? -6 : surprised ? -9 : angry ? 6 : sad || state === "ERROR" ? 4 : 0, dt, 12);
        if (!sleeping) {
          const questioning = state === "CONFUSED" || state === "THINKING" || curious;
          const worried = state === "ERROR" || sad;
          facial.moveTo(-61, -45 + brow)
            .quadraticCurveTo(-46, -51 + brow - (questioning ? 7 : 0) + (angry ? 10 : 0), -30, -45 + brow - (worried ? 8 : 0) + (angry ? 12 : 0))
            .stroke({ color: 0xe4fcff, alpha: 0.8, width: 2.5, cap: "round" });
          facial.moveTo(30, -45 + brow - (worried ? 8 : 0))
            .quadraticCurveTo(46, -51 + brow + (questioning ? 7 : 0) + (angry ? 10 : 0), 61, -45 + brow + (questioning ? 4 : 0) - (angry ? 12 : 0))
            .stroke({ color: 0xe4fcff, alpha: 0.8, width: 2.5, cap: "round" });
        }
        if (state === "THINKING")
          for (let i = 0; i < 3; i++)
            facial
              .circle(-12 + i * 12, -85, 2.5)
              .fill({
                color: 0xf3ffff,
                alpha: 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4 - i)),
              });
        if (expression === "HAPPY" || laughing || proud)
          for (const x of [-76, 76])
            facial.ellipse(x, 25, 10, 4).fill({ color: 0xe3bbf9, alpha: 0.5 });
        if (sad) facial.ellipse(63, 4, 3, 7).fill({ color: 0x9fe9ff, alpha: 0.75 });
        if (surprised) for (const x of [-44, 44]) facial.circle(x, -9, 3).fill({ color: 0xf3ffff, alpha: 0.75 });
        const count =
          s.particles && motion && !s.lowPower
            ? Math.round((sleeping ? 5 : 18) * quality)
            : 0;
        sparkles.forEach((p, i) => {
          p.sprite.visible = i < count;
          if (!p.sprite.visible) return;
          const angle = p.angle + t * p.speed * (state === "THINKING" ? 2 : 1);
          p.sprite.position.set(
            Math.cos(angle) * p.radius,
            Math.sin(angle * 0.8) * 110 - 20,
          );
          p.sprite.alpha =
            (0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.phase))) *
            s.brightness;
        });
      });
      const oldCleanup = cleanup;
      const pointer = (event: PointerEvent) => {
        if (event.pointerType === "touch" || (!preview && useStore.getState().native)) return;
        const bounds = host.current?.getBoundingClientRect();
        if (bounds) signals.cursor = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
      };
      document.addEventListener("pointermove", pointer, { passive: true });
      cleanup = () => {
        document.removeEventListener("pointermove", pointer);
        document.removeEventListener("visibilitychange", visibility);
        oldCleanup();
        Object.values(tex).forEach((t) => t.destroy(true));
      };
    };
    let cleanup = () => {
      if (!preview) signals.hitTest = undefined;
      observer?.disconnect();
      // A saved accent can replace this effect while Pixi is still awaiting
      // its renderer. Application plugins cannot be destroyed before init.
      // In that case the completed initializer owns deferred cleanup.
      if (app && initialized) {
        app.destroy(true, { children: true });
        app = undefined;
        initialized = false;
      }
    };
    void initialize().catch((error) => {
      if (!disposed)
        useStore.setState({
          error: `No se pudo iniciar el renderizador: ${String(error)}`,
        });
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [accent, petStyle, preview]);
  return (
    <div
      ref={host}
      className={`pet-renderer ${className}`}
      role="img"
      aria-label={`Karen, estilo ${petStyles[petStyle].name}, con ojos expresivos`}
    />
  );
}
