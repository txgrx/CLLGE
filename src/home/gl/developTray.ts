/**
 * A developing tray in WebGL: the print sits under a thin layer of liquid. Scroll
 * progress develops it (highlights first, unevenly, sepia → full colour), the
 * safelight sweeps across, and the pointer leaves ripples. No library: one quad.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uImgAspect;
uniform float uOffset;
uniform float uTime;
uniform float uP;
uniform vec4 uRip[8];
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;
  float calm = 1.0 - smoothstep(0.72, 1.0, uP);

  // Height field of the liquid: slow swell + fine turbulence + pointer ripples.
  vec2 d = vec2(sin(p.y * 8.0 + t * 0.8), cos(p.x * 6.5 - t * 0.6)) * 0.0022 * calm;
  d += (vec2(fbm(p * 3.0 + t * 0.06), fbm(p * 3.0 - t * 0.05 + 7.0)) - 0.5) * 0.012 * calm;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRip[i];
    float age = t - r.z;
    if (age < 0.0 || age > 4.0 || r.w <= 0.0) continue;
    vec2 c = vec2(r.x * aspect, r.y);
    float dist = distance(p, c);
    float ring = sin(dist * 58.0 - age * 11.0) * exp(-dist * 5.0) * exp(-age * 1.1) * r.w;
    d += normalize(p - c + 1e-5) * ring * 0.014;
  }

  // Texture rows go top→bottom (ImageBitmap ignores UNPACK_FLIP_Y), so flip here.
  vec2 iuv = vec2(uOffset + (uv.x * aspect) / uImgAspect, 1.0 - uv.y) + d;
  vec3 col = texture2D(uTex, clamp(iuv, 0.001, 0.999)).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // Development: highlights come up first, unevenly, like a real print.
  float n = fbm(p * 2.2 + 3.0) * 0.38;
  float dev = smoothstep(0.0, 1.0, uP * 1.45 - (1.0 - lum) * 0.6 - n + 0.12);
  vec3 latent = vec3(0.03, 0.026, 0.026);
  vec3 sepia = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
  vec3 midc = mix(sepia * 0.75, col, smoothstep(0.35, 0.95, uP));
  vec3 outc = mix(latent, midc, dev);

  // Safelight: a red wash plus a slow beam sweeping the tray.
  float beamX = fract(t * 0.045) * 1.8 - 0.4;
  float beam = exp(-pow((uv.x - beamX) * 2.6, 2.0)) * 0.22 * calm;
  outc += vec3(1.0, 0.23, 0.18) * (0.05 * calm + beam) * (0.35 + 0.65 * (1.0 - dev));

  // Specular glints on the liquid.
  float spec = pow(max(0.0, d.x * 70.0 + d.y * 40.0), 2.0) * 0.35 * calm;
  outc += vec3(1.0, 0.85, 0.8) * spec;

  float v = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(aspect * 0.75, 1.0)));
  outc *= mix(0.5, 1.0, v);
  gl_FragColor = vec4(outc, 1.0);
}`;

export interface Tray {
  setProgress(p: number): void;
  ripple(x: number, y: number, strength?: number): void;
  setActive(on: boolean): void;
  destroy(): void;
}

export function createTray(canvas: HTMLCanvasElement, image: TexImageSource, imgAspect: number, focusX: number): Tray | null {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = u('uRes');
  const uTime = u('uTime');
  const uP = u('uP');
  const uRip = u('uRip');
  const uOffset = u('uOffset');
  gl.uniform1f(u('uImgAspect'), imgAspect);
  gl.uniform1i(u('uTex'), 0);

  const ripples = new Float32Array(8 * 4);
  let next = 0;
  let progress = 0;
  let active = false;
  let raf = 0;
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;

  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, w, h);
    // Keep the interesting part (the sun) in view on narrow screens.
    const visible = w / h / imgAspect;
    gl.uniform1f(uOffset, Math.max(0, Math.min(1 - visible, focusX - visible / 2)));
  };
  const frame = () => {
    resize();
    gl.uniform1f(uTime, now());
    gl.uniform1f(uP, progress);
    gl.uniform4fv(uRip, ripples);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = active ? requestAnimationFrame(frame) : 0;
  };

  return {
    setProgress(p) {
      progress = p;
      if (!active && !raf) raf = requestAnimationFrame(frame);
    },
    ripple(x, y, strength = 0.7) {
      ripples.set([x, y, now(), strength], next * 4);
      next = (next + 1) % 8;
    },
    setActive(on) {
      active = on;
      if (on && !raf) raf = requestAnimationFrame(frame);
    },
    destroy() {
      active = false;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}
