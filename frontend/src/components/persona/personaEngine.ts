/* eslint-disable @typescript-eslint/no-explicit-any */
// GRID07 persona engine: a 3D particle-dust head that follows the cursor,
// listens, thinks, hands off between experts and speaks.
// Framework-free so it can be mounted by a small React wrapper.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export type PersonaId = 'core' | 'finance' | 'code' | 'security' | 'research' | 'general'
export type PersonaState = 'idle' | 'listening' | 'thinking' | 'speaking'

export const PERSONA_META: Record<PersonaId, { name: string; color: string; eyes: [number, number] }> = {
  core: { name: 'Grid07 Core', color: '#bfe6ff', eyes: [1, 1] },
  finance: { name: 'Finance Advisor', color: '#ffc46b', eyes: [1.1, 0.9] },
  code: { name: 'Code Engineer', color: '#5cf2c8', eyes: [0, 0] },
  security: { name: 'Security Specialist', color: '#ff5a5f', eyes: [2.2, 0.35] },
  research: { name: 'Research Assistant', color: '#b49bff', eyes: [1.25, 1.25] },
  general: { name: 'General Assistant', color: '#9fe8ff', eyes: [1.5, 1.5] },
}
const ORDER: PersonaId[] = ['core', 'finance', 'code', 'security', 'research', 'general']

export interface PersonaEngine {
  setPersona(id: PersonaId): void
  setState(s: PersonaState): void
  setFollow(on: boolean): void
  nod(): void
  resetView(): void
  dispose(): void
}

export function createPersonaEngine(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  opts: { headUrl: string; quality?: 'high' | 'low'; interactive?: boolean } ,
): PersonaEngine {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const low = opts.quality === 'low'
  // match the look of the original prototype (no colour-space conversion)
  THREE.ColorManagement.enabled = false
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.5 : 2))
  renderer.setClearColor(0x05060a, 1)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0.05, 7.4)

  const uni: Record<string, { value: any }> = {
    uTime: { value: 0 }, uColor: { value: new THREE.Color(PERSONA_META.core.color) }, uMorph: { value: 1 },
    uThink: { value: 0 }, uSpeak: { value: 0 }, uBurst: { value: 0 }, uListen: { value: 0 }, uGain: { value: 1 },
  }
  const headMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uMorph; varying vec3 vN; varying vec3 vV;
      void main(){ float facing = max(dot(normalize(vN), normalize(vV)), 0.0); float rim = pow(1.0 - facing, 2.4);
        gl_FragColor = vec4((uColor * (rim * 0.32 + facing * 0.035) + vec3(0.006, 0.007, 0.01)) * uMorph, 1.0); }`,
  })

  const group = new THREE.Group(); scene.add(group)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
  const eyes: THREE.Sprite[] = []
  for (const sx of [-1, 1]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(PERSONA_META.core.color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); s.scale.set(0.15, 0.15, 1); s.userData.sx = sx; s.visible = false; group.add(s); eyes.push(s) }

  // data streams
  const PN = low ? 1200 : 2600, pPos = new Float32Array(PN * 3), pSeed = new Float32Array(PN * 4)
  for (let i = 0; i < PN; i++) pSeed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  const pMat = new THREE.PointsMaterial({ size: 0.028, map: glowTex, color: new THREE.Color(PERSONA_META.core.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })
  const parts = new THREE.Points(pGeo, pMat); scene.add(parts)

  let headReady = false, disposed = false
  const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer
  fetch(opts.headUrl).then(r => r.json()).then((d: { p: string; i: string; it: string }) => {
    if (disposed) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64(d.p)), 3))
    geo.setIndex(new THREE.BufferAttribute(d.it === 'Uint32Array' ? new Uint32Array(b64(d.i)) : new Uint16Array(b64(d.i)), 1))
    geo.computeBoundingBox(); const bb = geo.boundingBox!, size = new THREE.Vector3(); bb.getSize(size)
    const s = 2.6 / size.y; geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2); geo.scale(s, s, s)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, headMat))
    const pos = geo.attributes.position.array as Float32Array, nor = geo.attributes.normal.array as Float32Array, idx = geo.index!.array, tri = idx.length / 3
    const area = new Float32Array(tri); let tot = 0; const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
    for (let k = 0; k < tri; k++) { A.fromArray(pos, idx[k * 3] * 3); B.fromArray(pos, idx[k * 3 + 1] * 3); C.fromArray(pos, idx[k * 3 + 2] * 3); tot += B.sub(A).cross(C.sub(A)).length() / 2; area[k] = tot }
    const cr = container.getBoundingClientRect(), areaK = Math.min(1, (cr.width * cr.height) / (1100 * 800)), DN = Math.round((low ? 0.6 : 1) * Math.max(22000, Math.min(90000, 90000 * Math.sqrt(areaK)))), dp = new Float32Array(DN * 3), dn = new Float32Array(DN * 3), dr = new Float32Array(DN)
    for (let k = 0; k < DN; k++) {
      let lo = 0, hi = tri - 1; const r = Math.random() * tot; while (lo < hi) { const m = (lo + hi) >> 1; if (area[m] < r) lo = m + 1; else hi = m }
      let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v } const w = 1 - u - v
      for (let c = 0; c < 3; c++) { dp[k * 3 + c] = pos[idx[lo * 3] * 3 + c] * w + pos[idx[lo * 3 + 1] * 3 + c] * u + pos[idx[lo * 3 + 2] * 3 + c] * v; dn[k * 3 + c] = nor[idx[lo * 3] * 3 + c] * w + nor[idx[lo * 3 + 1] * 3 + c] * u + nor[idx[lo * 3 + 2] * 3 + c] * v }
      dr[k] = Math.random()
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('normal', new THREE.BufferAttribute(dn, 3)); dg.setAttribute('aR', new THREE.BufferAttribute(dr, 1))
    const px = Math.min(window.devicePixelRatio, 2).toFixed(1)
    const dustMat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uSpeak, uThink, uBurst, uListen; attribute float aR; varying float vA;
        void main(){ vec3 p = position + normal * (0.004 + 0.012 * uSpeak * sin(position.y * 18.0 - uTime * 10.0));
          p += normal * uBurst * (0.08 + aR * 0.55) + vec3(sin(aR * 90.), cos(aR * 70.), sin(aR * 40.)) * uBurst * 0.12;
          p += vec3(sin(uTime * 1.7 + aR * 60.), cos(uTime * 1.3 + aR * 45.), 0.) * 0.0035;
          vec4 mv = modelViewMatrix * vec4(p, 1.); vec3 n = normalize(normalMatrix * normal); float facing = max(dot(n, normalize(-mv.xyz)), 0.);
          float scan = smoothstep(0.05, 0.0, abs(fract(position.y * 0.4 - uTime * 0.7) - 0.5)) * uThink;
          vA = (0.28 + 0.8 * pow(1. - facing, 1.6)) * (0.72 + 0.28 * sin(uTime * 2. + aR * 50.)) * (1. + uListen * .25) + scan * 1.3 + uBurst * .15;
          gl_Position = projectionMatrix * mv; gl_PointSize = (0.85 + aR * 1.15 + uBurst * .4) * ${px}; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uGain; varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(uColor * vA * (1. - d * 1.1) * 1.25 * uGain, 1.); }` })
    group.add(new THREE.Points(dg, dustMat))
    eyes[0].position.set(-0.19, 0.6, 0.66); eyes[1].position.set(0.19, 0.6, 0.66); eyes.forEach(e => { e.userData.base = e.position.clone(); e.visible = true })
    headReady = true
  }).catch(() => { /* leave the stage dark if the model fails to load */ })

  // ---------- persona accessories ----------
  const ACC: THREE.Object3D[] = []
  const mkPoints = (n: number, fn: (i: number) => number[], size: number) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(fn(i), i * 3); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })) }
  const glowMat = (c: string) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const addAcc = (i: number, obj: THREE.Object3D, update?: (t: number, s: { think: number; speak: number }) => void) => { obj.userData.persona = i; obj.userData.update = update; group.add(obj); ACC.push(obj) }
  const setOp = (o: THREE.Object3D, v: number) => o.traverse((c: any) => { if (c.material) { c.material.opacity = v * (c.userData.op ?? 1); c.visible = v > 0.01 } })
  const disposables: { dispose(): void }[] = [glowTex, headMat, pGeo, pMat]

  { // Finance: gold orbit ring, coins, chart bars
    const g = new THREE.Group()
    const ring = mkPoints(1400, i => { const a = i / 1400 * Math.PI * 2, r = 1.55 + (Math.random() - .5) * .04; return [Math.cos(a) * r, (Math.random() - .5) * .03, Math.sin(a) * r] }, 0.03); (ring.material as THREE.PointsMaterial).color = new THREE.Color('#ffd58a'); ring.rotation.x = 0.35; g.add(ring)
    const coins = new THREE.Group()
    for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .018, 32), glowMat('#ffcf7a')); c.userData.a = k / 7 * Math.PI * 2; c.userData.op = 0.85; coins.add(c); const rim = new THREE.Mesh(new THREE.TorusGeometry(.11, .008, 8, 40), glowMat('#fff1c9')); rim.rotation.x = Math.PI / 2; c.add(rim) }
    coins.rotation.x = 0.35; g.add(coins)
    const bars = new THREE.Group()
    for (let k = 0; k < 9; k++) { const h = .3 + k * .13 + Math.random() * .15; const b = new THREE.Mesh(new THREE.PlaneGeometry(.12, h), glowMat('#ffb84d')); b.position.set(-1.2 + k * .3, -1.0 + h / 2, -1.25); b.userData.h = h; b.userData.op = 0.4; bars.add(b) }
    g.add(bars)
    addAcc(1, g, (t, s) => { ring.rotation.y = t * .25; coins.children.forEach(c => { const a = c.userData.a + t * .35; c.position.set(Math.cos(a) * 1.55, Math.sin(a * 2 + t) * .05, Math.sin(a) * 1.55); c.rotation.z = t * 2 + a }); bars.children.forEach((b, k) => { const k2 = 0.75 + 0.25 * Math.sin(t * 1.2 + k * .7) + s.think * .3; b.scale.y = k2; b.position.y = -1.0 + b.userData.h * k2 / 2 }) })
  }
  { // Code: scrolling code visor + floating glyphs
    const g = new THREE.Group()
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const cx = cv.getContext('2d')!
    const lines = ['const route = await router.pick(query)', 'if (score > 0.82) return expert', 'def generate(state): return llm(state)', 'SELECT * FROM agents WHERE active', 'async def search(q): await exa(q)', 'export const run = (task) => graph(task)']
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; disposables.push(tex)
    const drawCode = (t: number) => { cx.clearRect(0, 0, 1024, 128); cx.font = '600 26px monospace'; for (let r = 0; r < 4; r++) { cx.fillStyle = r % 2 ? 'rgba(160,255,225,.95)' : 'rgba(92,242,200,.75)'; cx.fillText(lines[(r + Math.floor(t * 1.5)) % lines.length] + '   ' + lines[(r + 3) % lines.length], -((t * 90 + r * 140) % 520), 30 + r * 30) } tex.needsUpdate = true }
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .2, 48, 1, true, -1.05, 2.1), new THREE.MeshBasicMaterial({ map: tex, color: '#5cf2c8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    visor.position.set(0, .6, .14); visor.userData.op = 1; g.add(visor)
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(.625, .625, .2, 48, 1, true, -1.05, 2.1), glowMat('#5cf2c8')); edge.userData.op = 0.22; edge.position.copy(visor.position); g.add(edge)
    const glyphs = new THREE.Group()
    ;['{ }', '</>', '=>', '( )', '[ ]', '#', '&&', 'fn'].forEach((sym, k, arr) => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d')!; x.font = '700 40px monospace'; x.fillStyle = '#9ff7dc'; x.textAlign = 'center'; x.fillText(sym, 64, 46)
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(.36, .18, 1); sp.userData = { a: k / arr.length * Math.PI * 2, r: 1.3 + (k % 3) * .22, y: -.4 + (k % 4) * .35, op: .8 }; glyphs.add(sp) })
    g.add(glyphs)
    addAcc(2, g, (t, s) => { drawCode(t * (1 + s.think * 2)); glyphs.children.forEach(sp => { const a = sp.userData.a + t * .4; sp.position.set(Math.cos(a) * sp.userData.r, sp.userData.y + Math.sin(t * 1.5 + a) * .08, Math.sin(a) * sp.userData.r) }) })
  }
  { // Security: hex shield dome + radar sweep
    const g = new THREE.Group()
    const ico = new THREE.IcosahedronGeometry(1.45, 2)
    const shell = new THREE.Mesh(ico, new THREE.MeshBasicMaterial({ color: '#ff5a5f', wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); shell.userData.op = 0.22; g.add(shell)
    const nodes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', ico.attributes.position), new THREE.PointsMaterial({ size: .05, map: glowTex, color: '#ff8a8d', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(nodes)
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48, 0, .5), glowMat('#ff5a5f')); sweep.rotation.x = -Math.PI / 2; sweep.position.y = -.25; sweep.userData.op = .3; g.add(sweep)
    const ringS = new THREE.Mesh(new THREE.RingGeometry(1.43, 1.47, 96), glowMat('#ff5a5f')); ringS.rotation.x = -Math.PI / 2; ringS.position.y = -.25; ringS.userData.op = .6; g.add(ringS)
    addAcc(3, g, (t, s) => { sweep.rotation.z = -t * (1.6 + s.think * 3); shell.rotation.y = t * .08; nodes.rotation.y = t * .08 })
  }
  { // Research: orbiting constellation of ideas
    const g = new THREE.Group(); const K = 70, P: THREE.Vector3[] = []
    for (let k = 0; k < K; k++) P.push(new THREE.Vector3(Math.random() - .5, (Math.random() - .5) * .8, Math.random() - .5).normalize().multiplyScalar(1.35 + Math.random() * .6))
    const pts = mkPoints(K, k => P[k].toArray(), .075); (pts.material as THREE.PointsMaterial).color = new THREE.Color('#d6c8ff'); g.add(pts)
    const seg: number[] = []; for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (P[i].distanceTo(P[j]) < .62) seg.push(...P[i].toArray(), ...P[j].toArray())
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#b49bff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); ls.userData.op = .45; g.add(ls)
    const orb = new THREE.Mesh(new THREE.TorusGeometry(1.75, .004, 6, 160), glowMat('#b49bff')); orb.rotation.set(1.42, .25, 0); orb.userData.op = .5; g.add(orb)
    addAcc(4, g, (t, s) => { g.rotation.y = t * (.12 + s.think * .5); g.rotation.z = Math.sin(t * .3) * .08 })
  }
  { // General: soft breathing halo rings + bubbles
    const g = new THREE.Group()
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.85 + k * .2, .006, 8, 140), glowMat('#9fe8ff')); r.position.set(0, .45, -.2); r.userData = { k, op: .55 - k * .12 }; g.add(r) }
    const bub = mkPoints(160, () => [(Math.random() - .5) * 3.4, -1.2 + Math.random() * 3, -.6 - Math.random() * .8], .06); (bub.material as THREE.PointsMaterial).color = new THREE.Color('#c9f4ff'); bub.userData.op = .7; g.add(bub)
    addAcc(5, g, (t, s) => { g.children.forEach(c => { if (c.userData.k !== undefined) { const sc = 1 + .05 * Math.sin(t * 1.6 - c.userData.k * .8) + s.speak * .06 * Math.sin(t * 9 + c.userData.k); c.scale.set(sc, sc, sc) } }); const a = bub.geometry.attributes.position.array as Float32Array; for (let i = 1; i < a.length; i += 3) { a[i] += .004; if (a[i] > 1.8) a[i] = -1.2 } bub.geometry.attributes.position.needsUpdate = true })
  }
  const accW = new Float32Array(6)
  let bloomK = 1

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.15); composer.addPass(bloom)
  const resize = () => { const r = container.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height); renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; const small = Math.min(1, Math.sqrt(w * h) / 700); camera.position.z = (w / h < 1 ? 7.4 / Math.max(.55, w / h) : 7.4) * (0.72 + 0.28 * small); camera.updateProjectionMatrix(); uni.uGain.value = 0.42 + 0.58 * small; bloomK = 0.35 + 0.65 * small }
  const ro = new ResizeObserver(resize); ro.observe(container); resize()

  // ---------- input ----------
  let eyeX = 0, eyeY = 0, listen = 0, rz = 0, mx = 0, my = 0, rx = 0, ry = 0, think = 0, speak = 0, cur = 0, nodAmt = 0
  let state: PersonaState = 'idle', follow = true, lastMove = 0, wander: [number, number] = [0, 0], wanderT = 0
  const target = new THREE.Color(PERSONA_META.core.color), colNow = new THREE.Color(PERSONA_META.core.color)
  const onMove = (e: PointerEvent) => { const r = container.getBoundingClientRect(); mx = Math.max(-1.3, Math.min(1.3, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2))); my = Math.max(-1.3, Math.min(1.3, (e.clientY - (r.top + r.height * .4)) / (window.innerHeight / 2))); lastMove = performance.now() }
  window.addEventListener('pointermove', onMove)
  let dragging = false, manual = false, mYaw = 0, mPitch = 0, vYaw = 0, vPitch = 0, lastPX = 0, lastPY = 0, releaseAt = 0
  const onDown = (e: PointerEvent) => { if (opts.interactive === false) return; dragging = true; if (!manual) { mYaw = ry; mPitch = rx } manual = true; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; lastPX = e.clientX; lastPY = e.clientY; vYaw = vPitch = 0 }
  const onDrag = (e: PointerEvent) => { if (!dragging) return; const dx = e.clientX - lastPX, dy = e.clientY - lastPY; lastPX = e.clientX; lastPY = e.clientY; vYaw = dx * 0.008; vPitch = dy * 0.006; mYaw += vYaw; mPitch = Math.max(-0.9, Math.min(0.9, mPitch + vPitch)) }
  const onUp = () => { if (!dragging) return; dragging = false; releaseAt = performance.now(); canvas.style.cursor = 'grab' }
  const resetView = () => { manual = false; vYaw = vPitch = 0; ry = ((ry % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; mYaw = ry }
  if (opts.interactive !== false) { canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none' }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onDrag); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('dblclick', resetView)

  let morphT = 1
  const setPersona = (id: PersonaId) => { const i = ORDER.indexOf(id); if (i < 0 || i === cur) return; cur = i; morphT = 0; target.set(PERSONA_META[id].color) }

  // pause when off-screen
  let visible = true
  const io = new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true }); io.observe(container)

  const clock = new THREE.Clock(); let lastT = 0, raf = 0
  const frame = () => {
    raf = requestAnimationFrame(frame)
    if (!visible || document.hidden) return
    const t = clock.getElapsedTime()
    think += ((state === 'thinking' ? 1 : 0) - think) * 0.06; speak += ((state === 'speaking' ? 1 : 0) - speak) * 0.08
    morphT = Math.min(1, morphT + 0.03); const dip = morphT < 0.5 ? 1 - morphT * 1.6 : (morphT - 0.5) * 2 * 0.8 + 0.2
    uni.uMorph.value = reduce ? 1 : Math.max(0.2, Math.min(1, dip))
    colNow.lerp(target, 0.06); uni.uColor.value.copy(colNow)
    uni.uTime.value = reduce ? 0 : t; uni.uThink.value = think; uni.uSpeak.value = speak
    const dt = Math.min(0.1, t - lastT); lastT = t; const kk = 1 - Math.exp(-dt * 6)
    for (let k = 0; k < 6; k++) accW[k] += ((k === cur && morphT > 0.45 ? 1 : 0) - accW[k]) * kk
    ACC.forEach(o => { const w = accW[o.userData.persona]; setOp(o, w); if (w > 0.01 && o.userData.update) o.userData.update(t, { think, speak }); o.scale.setScalar(0.85 + 0.15 * w) })
    // persona body language
    let ax = 0, ay = 0, az = 0
    if (cur === 2) { ax = Math.sin(t * 7) * 0.006; ay = Math.round(Math.sin(t * 0.9) * 2) * 0.04 }
    if (cur === 3) ay = Math.sin(t * 0.6) * 0.35
    if (cur === 4) az = 0.12 + Math.sin(t * 0.5) * 0.04
    if (cur === 5) ax = Math.sin(t * 1.4) * 0.04
    const followAmt = cur === 3 ? 0.35 : 1
    // gaze: cursor, a calm drift when following is off, a glance around when the cursor is still
    const idle = performance.now() - lastMove > 3500 && state === 'idle'
    if ((idle || !follow) && t > wanderT) { wander = [(Math.random() - .5) * .9, (Math.random() - .5) * .5]; wanderT = t + 1.8 + Math.random() * 2.2 }
    let gx = idle ? wander[0] : mx, gy = idle ? wander[1] : my
    if (!follow) { gx = Math.sin(t * 0.21) * 0.22 + Math.sin(t * 0.07) * 0.1; gy = Math.sin(t * 0.16) * 0.08 - 0.02 }
    gx = gx * (1 - think) + 0.55 * think; gy = gy * (1 - think) - 0.45 * think
    eyeX += (gx - eyeX) * 0.4; eyeY += (gy - eyeY) * 0.4
    listen += ((state === 'listening' ? 1 : 0) - listen) * 0.08; nodAmt *= 0.93; uni.uListen.value = listen
    const tyaw = gx * 0.55 * followAmt + ay, tpitch = gy * 0.3 * followAmt + ax + listen * 0.1 + Math.sin(t * 16) * nodAmt * 0.05 + Math.sin(t * 3.4) * 0.03 * speak
    if (manual && !dragging && performance.now() - releaseAt > 1200) resetView()
    if (manual) { if (!dragging) { mYaw += vYaw; mPitch = Math.max(-0.9, Math.min(0.9, mPitch + vPitch)); vYaw *= 0.93; vPitch *= 0.9 } ry += (mYaw - ry) * 0.25; rx += (mPitch - rx) * 0.25 }
    else { ry += (tyaw - ry) * 0.1; rx += (tpitch - rx) * 0.1 }
    rz += ((az - ry * 0.12) - rz) * 0.1
    if (reduce) { rx = 0; ry = 0; rz = 0 }
    group.rotation.set(rx + Math.sin(t * 0.7) * 0.015, ry + Math.sin(t * 0.35) * 0.04, rz)
    group.position.z += (listen * 0.35 - group.position.z) * 0.06
    group.position.y = Math.sin(t * 0.9) * 0.03
    uni.uBurst.value = reduce ? 0 : (morphT < 1 ? Math.sin(morphT * Math.PI) : 0)
    const eyeGlow = 0.8 + 0.2 * Math.sin(t * 2) + think * 0.6 * (0.5 + 0.5 * Math.sin(t * 9)) + speak * 0.3 * Math.sin(t * 14)
    const es = PERSONA_META[ORDER[cur]].eyes
    eyes.forEach(e => {
      if (e.userData.base) { const ex = manual ? 0 : Math.max(-1, Math.min(1, eyeX - ry / 0.55)), ey = manual ? 0 : Math.max(-1, Math.min(1, eyeY - rx / 0.3)); e.position.x = e.userData.base.x + ex * 0.035; e.position.y = e.userData.base.y - ey * 0.025 }
      e.scale.x += (0.15 * es[0] - e.scale.x) * 0.1; e.scale.y += (0.15 * es[1] - e.scale.y) * 0.1
      e.material.opacity = (es[0] === 0 ? 0 : 1) * Math.max(0, Math.min(1, (Math.cos(group.rotation.y) - .25) * 3)) * Math.max(0, Math.min(1, (Math.cos(group.rotation.x) - .3) * 4)) * Math.max(0, Math.min(1, 1 - Math.max(0, e.userData.sx * group.rotation.y - 0.25) * 2.2))
      e.material.color.copy(colNow).lerp(new THREE.Color(1, 1, 1), 0.35).multiplyScalar(1.1 * eyeGlow)
    })
    // data streams
    const sp = 1 + think * 2.5 + speak * 1.2
    for (let i = 0; i < PN; i++) {
      const a = pSeed[i * 4], b = pSeed[i * 4 + 1], c = pSeed[i * 4 + 2], d = pSeed[i * 4 + 3]
      let x: number, y: number, z: number
      if (i % 3 === 0) { const u = (a + t * 0.05 * sp) % 1; x = -0.6 - u * 3.2; y = -0.05 - Math.pow(u, 1.6) * 0.9 + Math.sin(u * 3) * 0.15; z = 0.5 - u * 0.8; const sc = 0.02 + u * 0.12; x += (b - .5) * sc; y += (c - .5) * sc; z += (d - .5) * sc }
      else if (i % 3 === 1) { const u = (a + t * 0.07 * sp) % 1; x = 0.75 + u * 2.6; y = 0.55 + u * 0.7 + Math.sin(u * 6 + b * 6) * 0.1 * u; z = -0.4 - u * 0.6; const sc = 0.05 + u * 0.9; x += (b - .5) * sc; y += (c - .5) * sc; z += (d - .5) * sc }
      else { x = (a - .5) * 9; y = (b - .5) * 5.5; z = -1.5 - c * 4; y += Math.sin(t * 0.2 + d * 6) * 0.08 }
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z
    }
    pGeo.attributes.position.needsUpdate = true; pMat.color.copy(colNow); pMat.opacity += ((cur === 0 ? 0.9 : 0.25) - pMat.opacity) * 0.05
    parts.rotation.y = ry * 0.85; parts.rotation.x = rx * 0.5; parts.position.set(group.position.x, group.position.y, 0)
    bloom.strength = (0.62 + think * 0.45 + speak * 0.22 + listen * 0.12 + uni.uBurst.value * 0.1) * bloomK
    if (headReady || t > 3) composer.render()
  }
  frame()

  return {
    setPersona,
    setState: s => { state = s },
    setFollow: on => { follow = on },
    nod: () => { nodAmt = 1 },
    resetView,
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onDrag); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('dblclick', resetView)
      scene.traverse((o: any) => { o.geometry?.dispose?.(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => { m.map?.dispose?.(); m.dispose?.() }) } })
      disposables.forEach(d => d.dispose()); composer.dispose(); renderer.dispose()
    },
  }
}
