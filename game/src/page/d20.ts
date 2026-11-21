// The roll stage's d20 (Glass Table design §5.2), from the WebGL prototype of 2026-11-20: a real
// mesh, flat shading, ink edges from barycentrics, numbers from a canvas atlas. It never picks a
// number (Rule 4): `rollTo` spins until it is given the engine's value and lands on that face.
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

function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) return qNorm([0, 1, 2, 3].map((i) => a[i] + (bb[i] - a[i]) * t) as Q);
  const th = Math.acos(d);
  const s = Math.sin(th);
  return [0, 1, 2, 3].map((i) => a[i] * (Math.sin((1 - t) * th) / s) + bb[i] * (Math.sin(t * th) / s)) as Q;
}

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
out vec3 vN; out vec3 vBar; out vec2 vUv; flat out vec2 vCell;
void main() {
  vec3 p = uRot * aPos; vN = uRot * aNrm; vBar = aBar; vUv = aUv; vCell = aCell;
  float persp = 1.0 / (1.0 - p.z * 0.22);
  gl_Position = vec4(p.xy * uScale * persp + uOff, -p.z * 0.5, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vBar; in vec2 vUv; flat in vec2 vCell;
uniform sampler2D uAtlas; uniform vec3 uInk; uniform vec3 uPaper;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
  float lit = 0.62 + 0.38 * max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 3.0) * 0.25;
  vec3 col = uPaper * (lit - rim);
  vec3 d = fwidth(vBar);
  vec3 e = smoothstep(vec3(0.0), d * 1.6, vBar);
  float edge = 1.0 - min(min(e.x, e.y), e.z);
  bool inCell = all(greaterThan(vUv, vec2(0.0))) && all(lessThan(vUv, vec2(1.0)));
  float glyph = inCell ? textureGrad(uAtlas, (vCell + vUv) / vec2(5.0, 4.0), dFdx(vUv) / 5.0, dFdy(vUv) / 4.0).a : 0.0;
  col = mix(col, uInk, max(edge, glyph));
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
  /** Spins and lands on the engine's value; resolves once it rests. */
  rollTo(value: number): Promise<void>;
  /** The face that looks at the viewer now. */
  face(): number;
  /** Gives the WebGL context back (the stage closes). */
  release(): void;
}

/** Colours as 0..1 RGB. */
export interface DieColours {
  ink: V3;
  paper: V3;
}

/** A die on `canvas`, or undefined with no WebGL2. */
export function mount(canvas: HTMLCanvasElement, colours: DieColours): Die | undefined {
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
  gl.uniform3f(U("uInk"), ...colours.ink);
  gl.uniform3f(U("uPaper"), ...colours.paper);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  let q = BY_NUM.get(20)!.q;
  let hop = 0;
  const draw = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(U("uRot"), false, qMat(q));
    gl.uniform2f(U("uOff"), 0, hop);
    gl.uniform1f(U("uScale"), 0.62);
    gl.drawArrays(gl.TRIANGLES, 0, 60);
  };
  draw();

  const LAND_MS = 900;
  const SPIN_RATE = (2 * Math.PI) / 600;
  const HOP_MS = 400;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rollTo(value: number): Promise<void> {
    const target = BY_NUM.get(value);
    // Not a d20 face: the die stays where it is.
    if (!target) return Promise.resolve();
    if (reduced()) {
      // No spin: the face shows.
      q = target.q;
      draw();
      return Promise.resolve();
    }
    const from = q;
    const axis = nrm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    return new Promise((resolve) => {
      const t0 = performance.now();
      let land: { t0: number; spin: number; from: Q } | undefined;
      const step = (now: number) => {
        if (!canvas.isConnected) {
          q = target.q;
          return resolve();
        }
        const waited = now - t0;
        if (!land) {
          // One hop of spin, then the landing.
          if (waited < HOP_MS) {
            q = qMul(qAxis(axis, SPIN_RATE * waited), from);
            hop = 0.08 * Math.abs(Math.sin((Math.PI * waited) / HOP_MS));
            draw();
            requestAnimationFrame(step);
            return;
          }
          const spin = (SPIN_RATE * LAND_MS) / 3;
          land = { t0: now, spin, from: qMul(qAxis(axis, -spin), qMul(qAxis(axis, SPIN_RATE * waited), from)) };
        }
        const t = Math.min(1, (now - land.t0) / LAND_MS);
        const e = 1 - Math.pow(1 - t, 3);
        q = qMul(qAxis(axis, land.spin * (1 - e)), qSlerp(land.from, target.q, e));
        hop = 0.14 * Math.abs(Math.sin(Math.PI * t * 2)) * Math.pow(1 - t, 1.6);
        draw();
        if (t < 1) requestAnimationFrame(step);
        else {
          q = target.q;
          hop = 0;
          draw();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  const face = () => FACES.reduce((best, f) => (qRotate(q, f.n)[2] > qRotate(q, best.n)[2] ? f : best)).num;
  const release = () => gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { rollTo, face, release };
}
