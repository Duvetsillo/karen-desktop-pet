import { Texture } from "pixi.js";
import type { PetStyle } from '../../shared/types';
type Painter = (ctx: CanvasRenderingContext2D) => void;
function paint(w: number, h: number, draw: Painter): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  return Texture.from(canvas);
}
function bodyPath(c: CanvasRenderingContext2D, style: PetStyle) {
  c.beginPath();
  if (style === 'orbit') {
    c.roundRect(112, 133, 288, 245, [105, 105, 80, 80]);
    return;
  }
  if (style === 'cloud') {
    c.moveTo(256, 139);
    c.bezierCurveTo(312, 95, 371, 134, 372, 181);
    c.bezierCurveTo(430, 189, 437, 263, 399, 292);
    c.bezierCurveTo(421, 346, 369, 398, 321, 374);
    c.bezierCurveTo(285, 417, 227, 410, 203, 377);
    c.bezierCurveTo(145, 403, 95, 359, 113, 311);
    c.bezierCurveTo(69, 277, 86, 204, 133, 193);
    c.bezierCurveTo(134, 140, 207, 111, 256, 139);
    c.closePath();
    return;
  }
  c.moveTo(256, 126);
  c.bezierCurveTo(339, 117, 393, 155, 405, 233);
  c.bezierCurveTo(416, 285, 391, 319, 375, 340);
  c.bezierCurveTo(359, 361, 359, 386, 337, 389);
  c.bezierCurveTo(312, 394, 302, 366, 278, 380);
  c.bezierCurveTo(254, 400, 242, 405, 222, 388);
  c.bezierCurveTo(196, 368, 182, 398, 158, 380);
  c.bezierCurveTo(146, 369, 146, 351, 130, 331);
  c.bezierCurveTo(102, 296, 103, 244, 118, 202);
  c.bezierCurveTo(140, 146, 184, 120, 256, 126);
  c.closePath();
}
export function createPetTextures(accent: string, style: PetStyle = 'crystal') {
  const body = paint(512, 512, (c) => {
    bodyPath(c, style);
    c.shadowColor = accent;
    c.shadowBlur = 22;
    const outer = c.createLinearGradient(125, 140, 370, 385);
    const colors = style === 'cloud' ? ['#fff8ff', '#e9dff5', '#c1b8db', '#f0e2ef'] : style === 'orbit' ? ['#d9e7f5', '#9badc6', '#536780', '#abb7d4'] : ['#edfaff', '#a7def6', '#77badb', '#c0b5ef'];
    [0, 0.25, 0.6, 1].forEach((stop, i) => outer.addColorStop(stop, colors[i]));
    c.fillStyle = outer;
    c.fill();
    c.shadowBlur = 0;
    c.save();
    bodyPath(c, style);
    c.clip();
    const sheen = c.createRadialGradient(205, 173, 12, 256, 270, 180);
    sheen.addColorStop(0, "#f5ffff");
    sheen.addColorStop(0.45, "#c7f5ff99");
    sheen.addColorStop(1, "#6d72d933");
    c.fillStyle = sheen;
    c.fillRect(90, 110, 340, 300);
    const belly = c.createRadialGradient(273, 338, 0, 270, 337, 100);
    belly.addColorStop(0, "#e5fdffbb");
    belly.addColorStop(0.5, "#c4deff44");
    belly.addColorStop(1, "#a59cff00");
    c.fillStyle = belly;
    c.fillRect(110, 270, 300, 145);
    for (let y = 130; style === 'crystal' && y < 405; y += 6) {
      c.fillStyle = y % 12 === 0 ? "#ffffff09" : "#162a5906";
      c.fillRect(100, y, 320, 1);
    }
    c.restore();
    bodyPath(c, style);
    c.strokeStyle = "#e1fbffc9";
    c.lineWidth = 2.5;
    c.stroke();
    // Face is recessed into the living glass, with asymmetric reflective edges.
    c.beginPath();
    c.moveTo(159, 217);
    c.bezierCurveTo(177, 193, 208, 201, 255, 205);
    c.bezierCurveTo(296, 201, 335, 188, 354, 214);
    c.bezierCurveTo(384, 245, 365, 289, 338, 301);
    c.bezierCurveTo(304, 319, 201, 320, 172, 299);
    c.bezierCurveTo(146, 281, 141, 246, 159, 217);
    c.closePath();
    const face = c.createLinearGradient(170, 205, 345, 310);
    face.addColorStop(0, "#273d66");
    face.addColorStop(0.6, "#142a4b");
    face.addColorStop(1, "#383961");
    c.fillStyle = face;
    c.fill();
    c.strokeStyle = "#adf0ff9c";
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(154, 183);
    c.bezierCurveTo(182, 152, 215, 146, 244, 151);
    c.strokeStyle = "#ffffffbd";
    c.lineWidth = 6;
    c.lineCap = "round";
    c.stroke();
    c.beginPath();
    c.moveTo(151, 195);
    c.lineTo(146, 205);
    c.strokeStyle = "#ffffff8c";
    c.lineWidth = 4;
    c.stroke();
    // Two embedded gill facets and a tiny luminous heart in the abdomen.
    for (const side of [-1, 1]) {
      c.save();
      c.translate(256 + side * 113, 278);
      c.rotate(side * 0.3);
      c.fillStyle = "#b4f7ff99";
      c.fillRect(-3, -5, 6, 10);
      c.fillRect(side * 10 - 2, -3, 4, 6);
      c.restore();
    }
    c.beginPath();
    c.moveTo(256, 340);
    c.bezierCurveTo(240, 327, 238, 348, 256, 355);
    c.bezierCurveTo(274, 345, 272, 328, 256, 340);
    c.fillStyle = "#efffff9c";
    c.fill();
    if (style === 'orbit') {
      c.beginPath();
      c.roundRect(222, 338, 68, 15, 7);
      c.fillStyle = '#132c49';
      c.fill();
      for (let x = 231; x <= 276; x += 15) {
        c.fillStyle = accent;
        c.fillRect(x, 343, 8, 5);
      }
      c.beginPath();
      c.moveTo(137, 317); c.quadraticCurveTo(256, 380, 375, 317);
      c.strokeStyle = '#f2fbff88'; c.lineWidth = 3; c.stroke();
    } else if (style === 'cloud') {
      for (const x of [162, 350]) {
        c.beginPath(); c.ellipse(x, 297, 15, 7, 0, 0, Math.PI * 2);
        c.fillStyle = '#edaddb66'; c.fill();
      }
    }
  });
  const fin = paint(150, 260, (c) => {
    c.beginPath();
    if (style === 'cloud') {
      c.moveTo(76, 239);
      c.bezierCurveTo(14, 195, 20, 104, 64, 94);
      c.bezierCurveTo(109, 81, 125, 189, 76, 239);
      c.closePath();
    } else if (style === 'orbit') {
      c.roundRect(65, 94, 18, 143, 9);
    } else {
    c.moveTo(76, 239);
    c.bezierCurveTo(50, 208, 20, 189, 26, 149);
    c.bezierCurveTo(29, 115, 66, 109, 44, 47);
    c.bezierCurveTo(42, 39, 49, 27, 58, 34);
    c.bezierCurveTo(102, 61, 119, 122, 106, 166);
    c.bezierCurveTo(100, 195, 90, 217, 76, 239);
    c.closePath();
    }
    const g = c.createLinearGradient(30, 40, 100, 236);
    g.addColorStop(0, "#e7e1ff");
    g.addColorStop(0.32, "#b3a6ed");
    g.addColorStop(0.65, accent);
    g.addColorStop(1, "#a0d2ec");
    c.shadowColor = accent;
    c.shadowBlur = 12;
    c.fillStyle = g;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = "#edffffad";
    c.lineWidth = 2;
    c.stroke();
    if (style === 'orbit') {
      c.beginPath(); c.arc(74, 90, 25, 0, Math.PI * 2);
      c.fillStyle = '#e6ffff'; c.shadowColor = accent; c.shadowBlur = 16;
      c.fill(); c.shadowBlur = 0;
      c.beginPath(); c.arc(74, 90, 13, 0, Math.PI * 2);
      c.fillStyle = accent; c.fill();
      return;
    }
    c.beginPath();
    c.moveTo(74, 217);
    c.bezierCurveTo(88, 157, 85, 107, 61, 59);
    c.strokeStyle = "#e5fcffa9";
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    c.moveTo(78, 160);
    c.bezierCurveTo(60, 147, 49, 143, 43, 130);
    c.strokeStyle = "#e5fcff66";
    c.lineWidth = 2;
    c.stroke();
  });
  const arm = paint(140, 130, (c) => {
    c.beginPath();
    if (style === 'orbit') {
      c.roundRect(22, 35, 99, 49, 22);
    } else if (style === 'cloud') {
      c.ellipse(70, 62, 44, 30, -0.2, 0, Math.PI * 2);
    } else {
    c.moveTo(120, 40);
    c.bezierCurveTo(75, 28, 54, 25, 23, 56);
    c.bezierCurveTo(0, 80, 34, 103, 70, 84);
    c.bezierCurveTo(89, 74, 108, 70, 120, 40);
    c.closePath();
    }
    const g = c.createLinearGradient(20, 40, 110, 90);
    g.addColorStop(0, "#c9c4f8");
    g.addColorStop(0.5, "#c5f3fc");
    g.addColorStop(1, "#79bddb");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "#e7ffff9c";
    c.lineWidth = 2;
    c.stroke();
  });
  const eye = paint(100, 120, (c) => {
    c.beginPath();
    c.moveTo(16, 58);
    c.bezierCurveTo(15, 18, 72, 11, 82, 46);
    c.bezierCurveTo(94, 88, 73, 106, 48, 104);
    c.bezierCurveTo(23, 104, 16, 85, 16, 58);
    c.closePath();
    const g = c.createLinearGradient(28, 24, 75, 104);
    g.addColorStop(0, "#f3ffff");
    g.addColorStop(0.48, "#a2f6ff");
    g.addColorStop(1, accent);
    c.shadowColor = accent;
    c.shadowBlur = 10;
    c.fillStyle = g;
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.ellipse(45, 94, 12, 3, -0.15, 0, Math.PI * 2);
    c.fillStyle = "#f0ffffb3";
    c.fill();
  });
  // Iris and highlights travel independently from the eye silhouette.
  const iris = paint(80, 96, (c) => {
    c.beginPath();
    c.ellipse(40, 48, 20, 28, -0.08, 0, Math.PI * 2);
    const gradient = c.createLinearGradient(27, 20, 52, 72);
    gradient.addColorStop(0, "#10182f");
    gradient.addColorStop(1, "#4b79b6");
    c.fillStyle = gradient;
    c.fill();
    c.beginPath();
    c.ellipse(32, 29, 9, 12, 0.35, 0, Math.PI * 2);
    c.fillStyle = "#ffffff";
    c.fill();
    c.beginPath();
    c.arc(52, 59, 4, 0, Math.PI * 2);
    c.fillStyle = "#deffff";
    c.fill();
  });
  const glow = paint(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "#bdf9ff85");
    g.addColorStop(0.3, accent + "40");
    g.addColorStop(1, accent + "00");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const shadow = paint(256, 96, (c) => {
    const g = c.createRadialGradient(128, 48, 0, 128, 48, 120);
    g.addColorStop(0, "#14385a55");
    g.addColorStop(0.5, "#1f4b6230");
    g.addColorStop(1, "#1f4b6200");
    c.save();
    c.translate(0, 31);
    c.scale(1, 0.36);
    c.fillStyle = g;
    c.fillRect(0, -50, 256, 200);
    c.restore();
  });
  const particle = paint(32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.15, "#d5fcff");
    g.addColorStop(0.35, accent + "7f");
    g.addColorStop(1, accent + "00");
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });
  return { body, fin, arm, eye, iris, glow, shadow, particle };
}
