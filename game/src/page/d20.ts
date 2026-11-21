// The roll stage's d20 (Glass Table design §5.2), from the WebGL prototype of 2026-11-20 and the die
// demo Stas picked from on 2026-11-21: a real mesh, edges from barycentrics, numbers from a canvas
// atlas, in liquid chrome or a wireframe. It never picks a number (Rule 4): `rollTo` rises, turns in
// place and comes down on the engine's value, always with the number upright.
// With no WebGL2 `mount` returns undefined and the stage shows the number as text.
type V3 = [number, number, number];
type Q = [number, number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => scl(a, 1 / Math.hypot(a[0], a[1], a[2]));
const qAxis = (ax: V3, ang: number): Q => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qNorm = (q: Q): Q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

function qFromRows(x: V3, y: V3, z: V3): Q {
  const [r00, r01, r02] = x;
  const [r10, r11, r12] = y;
  const [r20, r21, r22] = z;
  const tr = r00 + r11 + r22;
  let q: Q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(r21 - r12) * s, (r02 - r20) * s, (r10 - r01) * s, 0.25 / s];
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    q = [0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s];
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    q = [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    q = [(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s];
  }
  return qNorm(q);
}

const qRotate = (q: Q, v: V3): V3 => {
  const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [r[0], r[1], r[2]];
};

/** Column-major mat3 for GLSL. */
const qMat = (q: Q): number[] => {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ];
};

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTS: V3[] = (
  [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]
).map(nrm);
/** Balanced numbering: opposite faces sum to 21, the five faces round every vertex sum to 52 or 53, no n next to n±1. */
const NUMS = [18, 11, 6, 13, 4, 7, 16, 2, 20, 9, 8, 15, 10, 3, 17, 1, 12, 14, 5, 19];

interface Face {
  a: V3;
  b: V3;
  c: V3;
  cen: V3;
  n: V3;
  num: number;
  /** The rest pose that shows this face to the viewer, vertex a up. */
  q: Q;
}

export const FACES: Face[] = (
  [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]] as V3[]
).map(([i, j, k], fi) => {
  const a = VERTS[i];
  let b = VERTS[j];
  let c = VERTS[k];
  const cen = scl(add(add(a, b), c), 1 / 3);
  let n = nrm(cross(sub(b, a), sub(c, a)));
  if (dot(n, cen) < 0) {
    // Keep counter-clockwise for culling.
    n = scl(n, -1);
    [b, c] = [c, b];
  }
  const y = nrm(sub(a, cen));
  return { a, b, c, cen, n, num: NUMS[fi], q: qFromRows(cross(y, n), y, n) };
});
const BY_NUM = new Map(FACES.map((f) => [f.num, f]));

const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec3 aBar; in vec2 aUv; in vec2 aCell;
uniform mat3 uRot; uniform vec2 uOff; uniform float uScale;
out vec3 vN; out vec3 vP; out vec3 vBar; out vec2 vUv; flat out vec2 vCell;
void main() {
  vec3 p = uRot * aPos; vP = p; vN = uRot * aNrm; vBar = aBar; vUv = aUv; vCell = aCell;
  float persp = 1.0 / (1.0 - p.z * 0.22);
  gl_Position = vec4(p.xy * uScale * persp + uOff, -p.z * 0.5, 1.0);
}`;
// Three finishes (Stas, 2026-11-21, from the die demo): liquid chrome, a mirror of a studio built from
// the page's own colours (walls of the page, bars of its text, a light in its accent, a table of its
// lines), its surface rippling slowly; a wireframe, a faint fill with edges and numbers in the page's
// accent, its far side seen through it; and liquid glass, the same studio bent through it and caught
// on its surface, its far edges seen through it, large numbers in the page's text colour with a thin
// outline in its background colour and no glow. WebGL cannot see the page under the die, so the
// studio stands in for it: light on a light page, dark on a dark one.
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vP; in vec3 vBar; in vec2 vUv; flat in vec2 vCell;
uniform sampler2D uAtlas; uniform vec3 uInk; uniform vec3 uAccent; uniform vec3 uWall; uniform vec3 uLine; uniform float uMode, uTime;
out vec4 o;
vec3 studio(vec3 r) {
  float az = atan(r.x, r.z);
  // Walls of the page's background, a little darker low down; bars of its text; a softbox overhead.
  vec3 c = mix(uWall * 0.82, uWall, clamp(r.y * 0.8 + 0.4, 0.0, 1.0));
  float bars = smoothstep(0.20, 0.12, abs(az - 0.75)) + smoothstep(0.12, 0.06, abs(az + 0.55))
             + smoothstep(0.25, 0.15, abs(az - 2.2)) + smoothstep(0.3, 0.2, abs(az + 2.0));
  c = mix(c, uInk, clamp(bars, 0.0, 1.0) * smoothstep(-0.1, 0.15, r.y) * 0.9);
  // One strip light in the accent, so a turn catches the page's own colour.
  c = mix(c, uAccent, smoothstep(0.1, 0.04, abs(az + 1.4)) * smoothstep(-0.1, 0.2, r.y));
  c += vec3(0.6) * smoothstep(0.5, 0.8, r.y) * smoothstep(0.9, 0.3, abs(az + 0.3));
  c = mix(c, uInk, exp(-abs(r.y - 0.02) * 30.0) * 0.6);
  // The table: the page's line colour, falling towards its text colour under the die.
  vec3 table = mix(uLine, mix(uLine, uInk, 0.45), clamp(-r.y * 1.6, 0.0, 1.0));
  return r.y < -0.02 ? table : c;
}
void main() {
  bool wire = uMode > 0.5 && uMode < 1.5;
  bool glass = uMode > 1.5;
  vec3 d = fwidth(vBar);
  vec3 e = smoothstep(vec3(0.0), d * (wire ? 1.4 : glass ? 1.2 : 0.9), vBar);
  float edge = 1.0 - min(min(e.x, e.y), e.z);
  vec3 soft = smoothstep(vec3(0.0), d * 8.0, vBar);
  float halo = 1.0 - min(min(soft.x, soft.y), soft.z);
  if (wire) {
    // The far side: its edges and a light fill, never its numbers (they would read mirrored).
    if (!gl_FrontFacing) { o = vec4(uAccent, 0.05 + 0.4 * edge + 0.08 * halo); return; }
    bool inCellW = all(greaterThan(vUv, vec2(0.0))) && all(lessThan(vUv, vec2(1.0)));
    float glyphW = inCellW ? textureGrad(uAtlas, (vCell + vUv) / vec2(5.0, 4.0), dFdx(vUv) / 5.0, dFdy(vUv) / 4.0).a : 0.0;
    o = vec4(uAccent, max(0.07 + 0.85 * edge + 0.15 * halo, glyphW * 0.9));
    return;
  }
  vec3 n = normalize(vN);
  // The surface ripples across each face, and the eye is close, so the reflection sweeps across a face as it turns.
  vec3 nl = normalize(n + 0.07 * vec3(sin(vP.y * 9.0 + uTime * 1.6), sin(vP.x * 8.0 - uTime * 1.2), sin((vP.x + vP.y) * 6.0 + uTime)));
  vec3 view = normalize(vP - vec3(0.0, 0.0, 2.4));
  vec3 H = normalize(normalize(vec3(-0.4, 0.6, 0.7)) + vec3(0.0, 0.0, 1.0));
  bool inCell = all(greaterThan(vUv, vec2(0.0))) && all(lessThan(vUv, vec2(1.0)));
  if (glass) {
    // The far side: a faint fill and its edges through the glass, never its numbers.
    if (!gl_FrontFacing) { o = vec4(mix(uWall, vec3(1.0), 0.5), 0.06 + 0.35 * edge); return; }
    float f = pow(1.0 - max(dot(nl, -view), 0.0), 2.0);
    // Through the glass the studio is bent and cooled; on the surface it is reflected.
    vec3 col = mix(studio(refract(view, nl, 0.66)) * vec3(0.78, 0.88, 0.96), studio(reflect(view, nl)), 0.2 + 0.65 * f);
    float alpha = 0.32 + 0.55 * f + 0.4 * edge;
    col = mix(col, vec3(1.0), edge * 0.8);
    // Large numbers (the cell read nearer its centre) in the page's text colour, with a thin outline
    // in its background colour cut sharp from a slightly thickened copy: they read on any page.
    vec2 guv = (vUv - 0.5) / 1.6 + 0.5;
    vec2 auv = (vCell + guv) / vec2(5.0, 4.0);
    vec2 gdx = dFdx(guv) / 5.0, gdy = dFdy(guv) / 4.0;
    float glyphG = inCell ? textureGrad(uAtlas, auv, gdx, gdy).a : 0.0;
    float rim = inCell ? smoothstep(0.1, 0.22, textureGrad(uAtlas, auv, gdx * 3.5, gdy * 3.5).a) : 0.0;
    col = mix(col, uWall, rim);
    alpha = max(alpha, rim);
    col = mix(col, uInk, glyphG);
    alpha = max(alpha, glyphG);
    float spec = pow(max(dot(n, H), 0.0), 90.0);
    o = vec4(col + vec3(spec), min(1.0, alpha + spec));
    return;
  }
  vec3 col = studio(reflect(view, nl));
  col = mix(col, uInk, edge * 0.55);
  float glyph = inCell ? textureGrad(uAtlas, (vCell + vUv) / vec2(5.0, 4.0), dFdx(vUv) / 5.0, dFdy(vUv) / 4.0).a : 0.0;
  col = mix(col, uInk, glyph);
  col += vec3(pow(max(dot(n, H), 0.0), 120.0));
  o = vec4(col, 1.0);
}`;

function atlas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const cell = 128;
  c.width = cell * 5;
  c.height = cell * 4;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${cell * 0.5}px Helvetica, Arial, sans-serif`;
  for (let n = 1; n <= 20; n++) {
    const x = ((n - 1) % 5) * cell + cell / 2;
    const y = Math.floor((n - 1) / 5) * cell + cell / 2;
    g.fillText(String(n), x, y + cell * 0.04);
    if (n === 6 || n === 9) g.fillRect(x - cell * 0.13, y + cell * 0.24, cell * 0.26, cell * 0.04);
  }
  return c;
}

function mesh(): Float32Array {
  const out: number[] = [];
  const GLYPH = 0.62;
  for (const f of FACES) {
    const col = (f.num - 1) % 5;
    const row = Math.floor((f.num - 1) / 5);
    const inr = Math.hypot(...sub(scl(add(f.a, f.b), 0.5), f.cen));
    for (const [v, bar] of [[f.a, [1, 0, 0]], [f.b, [0, 1, 0]], [f.c, [0, 0, 1]]] as Array<[V3, V3]>) {
      const loc = qRotate(f.q, sub(v, f.cen));
      out.push(...v, ...f.n, ...bar, loc[0] / (inr * 2 * GLYPH) + 0.5, 0.5 - loc[1] / (inr * 2 * GLYPH), col, row);
    }
  }
  return new Float32Array(out);
}

export interface Die {
  /** Rises, turns in place and comes down on the engine's value; resolves once it rests. */
  rollTo(value: number): Promise<void>;
  /** The face that looks at the viewer now. */
  face(): number;
  /** Gives the WebGL context back (the stage closes). */
  release(): void;
}

/** The finishes the page offers. */
export const FINISHES = ["chrome", "wire", "glass"] as const;
export type Finish = (typeof FINISHES)[number];

/** A finish and the page's colours for it, as 0..1 RGB. */
export interface DieLook {
  finish: Finish;
  /** The page's text: the numbers and edges on chrome, the dark bars of its studio. */
  ink: V3;
  /** The page's accent: the wireframe, and one strip light in the chrome's studio. */
  accent: V3;
  /** The page's background: the walls of the chrome's studio. */
  paper: V3;
  /** The page's lines: the table the chrome reflects. */
  line: V3;
}

/**
 * A die on `canvas`, or undefined with no WebGL2. `shadow`, when given, is an element under the
 * canvas that the die moves as its shadow on the table: smaller and fainter the higher it hovers.
 */
export function mount(canvas: HTMLCanvasElement, look: DieLook, shadow?: HTMLElement): Die | undefined {
  const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
  if (!gl) return undefined;
  const shader = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh(), gl.STATIC_DRAW);
  const stride = 13 * 4;
  for (const [name, size, off] of [["aPos", 3, 0], ["aNrm", 3, 3], ["aBar", 3, 6], ["aUv", 2, 9], ["aCell", 2, 11]] as const) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
  }
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  // The wireframe and the glass are see-through: no depth buffer, the far side drawn first and blended under the near one.
  const through = look.finish !== "chrome";
  gl.uniform3f(U("uInk"), ...look.ink);
  gl.uniform3f(U("uAccent"), ...look.accent);
  gl.uniform3f(U("uWall"), ...look.paper);
  gl.uniform3f(U("uLine"), ...look.line);
  gl.uniform1f(U("uMode"), FINISHES.indexOf(look.finish));
  gl.enable(gl.CULL_FACE);
  if (through) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  } else gl.enable(gl.DEPTH_TEST);

  const SCALE = 0.56;
  const FLOOR = -0.1;
  let q = BY_NUM.get(20)!.q;
  /** Height above the table, in clip units. */
  let y = 0;
  const draw = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(U("uRot"), false, qMat(q));
    gl.uniform1f(U("uTime"), performance.now() / 1000);
    gl.uniform2f(U("uOff"), 0, FLOOR + y);
    gl.uniform1f(U("uScale"), SCALE);
    if (through) {
      gl.cullFace(gl.FRONT);
      gl.drawArrays(gl.TRIANGLES, 0, 60);
      gl.cullFace(gl.BACK);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 60);
    if (shadow) {
      const k = 1 / (1 + y * 3);
      shadow.style.transform = `translate(-50%, -50%) scale(${k})`;
      shadow.style.opacity = String(0.85 * k);
    }
  };
  draw();

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rollTo(value: number): Promise<void> {
    const target = BY_NUM.get(value);
    // Not a d20 face: the die stays where it is.
    if (!target) return Promise.resolve();
    if (reduced()) {
      // No motion: the face shows.
      q = target.q;
      y = 0;
      draw();
      return Promise.resolve();
    }
    // The throw happens in place: the die rises off the table, hangs there turning, and comes down on the number.
    const axis = nrm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 + 0.3]);
    const spin = 12 + Math.random() * 3;
    const HOVER = 0.25;
    const BOB = 0.025;
    const BOB_HZ = 0.9;
    const AIR = 0.55;
    // Pose spring a little under critical: one soft overshoot. The lift spring settles it on the table.
    const K = 60;
    const C = 2 * Math.sqrt(K) * 0.6;
    const LIFT_K = 38;
    const LIFT_C = 2 * Math.sqrt(LIFT_K) * 0.85;
    let w: V3 = [0, 0, 0];
    let vy = 0;
    let t = 0;
    let wobble = 0;
    let landing: number | undefined;
    return new Promise((resolve) => {
      let last = performance.now();
      const step = (now: number) => {
        if (!canvas.isConnected) {
          q = target.q;
          y = 0;
          return resolve();
        }
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        t += dt;
        if (t < 0.25) {
          // Speed-up: the spin builds as the die leaves the hand.
          w = scl(axis, spin * (0.2 + 0.8 * Math.pow(t / 0.25, 1.5)));
        } else if (landing === undefined) {
          // Air takes the spin slowly; a slow drift of the axis keeps the tumble alive.
          w = scl(w, Math.exp(-AIR * dt));
          wobble += dt;
          w = add(w, scl([Math.sin(wobble * 1.7), Math.cos(wobble * 1.3), Math.sin(wobble * 0.9)], 1.2 * dt));
          const sp = Math.hypot(...w);
          if (t > 0.7 && (sp < 7.5 || t > 1.6)) landing = t;
        }
        // Height: up to the hover with a slow bob while it turns; down to the table a moment after it starts turning to the face.
        const want = landing === undefined ? HOVER + BOB * Math.sin(2 * Math.PI * BOB_HZ * t) : 0;
        const lag = landing === undefined ? 1 : Math.min(1, (t - landing) / 0.35);
        vy += (LIFT_K * (want - y) * lag - LIFT_C * vy) * dt;
        y = Math.max(0, y + vy * dt);
        if (landing !== undefined) {
          let err = qMul(target.q, [-q[0], -q[1], -q[2], q[3]]);
          if (err[3] < 0) err = [-err[0], -err[1], -err[2], -err[3]];
          const ang = 2 * Math.acos(Math.min(1, err[3]));
          const sh = Math.sqrt(Math.max(1e-12, 1 - err[3] * err[3]));
          const errAxis: V3 = ang > 1e-6 ? [err[0] / sh, err[1] / sh, err[2] / sh] : [0, 0, 0];
          w = add(w, scl(sub(scl(errAxis, K * ang), scl(w, C)), dt));
          if (ang < 0.003 && Math.hypot(...w) < 0.05 && y < 0.002 && Math.abs(vy) < 0.01) {
            q = target.q;
            y = 0;
            draw();
            return resolve();
          }
        }
        const sp = Math.hypot(...w);
        if (sp > 1e-6) q = qNorm(qMul(qAxis(scl(w, 1 / sp), sp * dt), q));
        draw();
        requestAnimationFrame(step);
      };
      requestAnimationFrame((now) => {
        last = now;
        step(now);
      });
    });
  }

  const face = () => FACES.reduce((best, f) => (qRotate(q, f.n)[2] > qRotate(q, best.n)[2] ? f : best)).num;
  const release = () => gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { rollTo, face, release };
}
