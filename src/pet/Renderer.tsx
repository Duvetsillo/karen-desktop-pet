import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite } from "pixi.js";
import "pixi.js/unsafe-eval";
import { createPetTextures } from "./textures";
import { signals, useStore } from "../state/store";

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
  useEffect(() => {
    let disposed = false;
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
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      host.current!.appendChild(app.canvas);
      app.canvas.setAttribute("aria-hidden", "true");
      const tex = createPetTextures(accent);
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
      const eyeL = make(tex.eye, eyes);
      eyeL.x = -44;
      eyeL.scale.set(0.7, 0.7);
      const eyeR = make(tex.eye, eyes);
      eyeR.x = 44;
      eyeR.scale.set(-0.7, 0.7);
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
        scene.scale.set(Math.min(width / 380, height / 440) * 0.8);
      };
      observer = new ResizeObserver(resize);
      observer.observe(host.current!);
      resize();
      let t = 0,
        blink = 0,
        nextBlink = 2 + Math.random() * 4,
        eyeOpen = 1,
        tilt = 0,
        mouth = 0,
        float = 0,
        eyeX = 0,
        eyeY = 0,
        lastState = "",
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
        const { settings: s, state } = useStore.getState();
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
        const activity = motion ? s.activity : 0;
        let targetTilt =
          state === "CONFUSED"
            ? -0.19
            : state === "THINKING"
              ? 0.1
              : state === "DRAGGING"
                ? 0.16
                : 0;
        if (motion) targetTilt += Math.sin(t * 0.6) * 0.022;
        tilt = damp(tilt, motion ? targetTilt : 0, dt, 7);
        root.rotation = tilt;
        const bob =
          activity *
          (sleeping
            ? Math.sin(t * 0.6) * 2
            : Math.sin(t * 1.65) * 6 + Math.sin(t * 0.7) * 2);
        const happy =
          state === "HAPPY" && motion ? Math.max(0, Math.sin(t * 7)) * -13 : 0;
        float = damp(
          float,
          bob +
            happy +
            (state === "LISTENING" ? -5 : 0) +
            (state === "DRAGGING" ? -12 : 0),
          dt,
          9,
        );
        root.y = float;
        const breathe =
          1 + (motion ? Math.sin(t * (sleeping ? 1.2 : 2.3)) * 0.009 : 0);
        root.scale.set(breathe, 2 - breathe);
        root.alpha = damp(
          root.alpha,
          (sleeping ? 0.57 : 1) * (s.nightMode ? 0.7 : 1) * s.opacity,
          dt,
          3,
        );
        body.tint = state === "ERROR" ? 0xffceb3 : 0xffffff;
        halo.alpha =
          (sleeping ? 0.08 : 0.22) * s.brightness * (s.nightMode ? 0.6 : 1);
        halo.tint = state === "ERROR" ? 0xffb473 : 0xffffff;
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
                  : 0) +
            Math.sin(t * 1.7) * 0.04 * activity,
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
                  : 0) -
            Math.sin(t * 1.7 + 0.6) * 0.04 * activity,
          dt,
          7,
        );
        armL.rotation =
          -0.25 +
          Math.sin(t * 2 + 0.3) * 0.07 * activity +
          (state === "HAPPY" ? -0.25 : 0);
        armR.rotation =
          0.25 -
          Math.sin(t * 2) * 0.07 * activity +
          (state === "HAPPY" ? 0.25 : 0);
        if (t > nextBlink && !sleeping) {
          blink = 0.16;
          nextBlink = t + 2.5 + Math.random() * 5.5;
        }
        blink = Math.max(0, blink - dt);
        const targetOpen = sleeping
          ? 0.04
          : blink > 0
            ? Math.max(0.04, Math.abs(blink - 0.08) / 0.08)
            : state === "HAPPY"
              ? 0.72
              : state === "LISTENING"
                ? 1.12
                : 1;
        eyeOpen = damp(eyeOpen, targetOpen, dt, blink > 0 ? 60 : 12);
        const cursor = s.cursorTracking ? signals.cursor : { x: 0.5, y: 0.5 };
        eyeX = damp(
          eyeX,
          Math.max(-5, Math.min(5, (cursor.x - 0.5) * 12)) +
            (motion ? Math.sin(t * 0.37) * 1.4 : 0),
          dt,
          7,
        );
        eyeY = damp(
          eyeY,
          Math.max(-3, Math.min(3, (cursor.y - 0.5) * 6)),
          dt,
          7,
        );
        eyes.position.set(eyeX, -7 + eyeY);
        eyeL.scale.y = 0.7 * eyeOpen;
        eyeR.scale.y = 0.7 * eyeOpen;
        mouth = damp(mouth, state === "SPEAKING" ? signals.energy : 0, dt, 22);
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
        } else if (state === "ERROR" || state === "CONFUSED") {
          facial
            .moveTo(-9, 44)
            .quadraticCurveTo(0, 35, 9, 44)
            .stroke({ color: 0xcdfaff, width: 3, cap: "round" });
        } else {
          facial
            .moveTo(-12, 36)
            .quadraticCurveTo(0, state === "HAPPY" ? 54 : 46, 12, 36)
            .stroke({ color: 0xcdfaff, width: 3, cap: "round" });
        }
        if (state === "CONFUSED") {
          facial
            .moveTo(-61, -58)
            .lineTo(-34, -64)
            .stroke({ color: 0xe4fcff, width: 3, cap: "round" });
          facial
            .moveTo(33, -58)
            .lineTo(59, -52)
            .stroke({ color: 0xe4fcff, width: 3, cap: "round" });
        }
        if (state === "THINKING")
          for (let i = 0; i < 3; i++)
            facial
              .circle(-12 + i * 12, -85, 2.5)
              .fill({
                color: 0xf3ffff,
                alpha: 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4 - i)),
              });
        if (state === "HAPPY")
          for (const x of [-76, 76])
            facial.ellipse(x, 25, 10, 4).fill({ color: 0xe3bbf9, alpha: 0.5 });
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
        if (lastState !== state) lastState = state;
      });
      const oldCleanup = cleanup;
      cleanup = () => {
        document.removeEventListener("visibilitychange", visibility);
        oldCleanup();
        Object.values(tex).forEach((t) => t.destroy(true));
      };
    };
    let cleanup = () => {
      if (!preview) signals.hitTest = undefined;
      observer?.disconnect();
      if (app) {
        app.destroy(true, { children: true });
        app = undefined;
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
  }, [accent, preview]);
  return (
    <div
      ref={host}
      className={`pet-renderer ${className}`}
      role="img"
      aria-label="Karen, criatura holográfica de cristal azul con aletas de luz y ojos expresivos"
    />
  );
}
