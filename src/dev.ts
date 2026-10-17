import type { Experience } from "./app";

/**
 * Outils de développement (jamais livrés) : `__xp`, et `__shot` qui rend une
 * image à une progression donnée et l'écrit dans `.shots/` via le serveur de
 * dev. Fonctionne même quand l'onglet est en arrière-plan.
 */
export function installDevTools(xp: Experience) {
  const shot = async (name: string, p: number, opts: { night?: number; w?: number; h?: number; dpr?: number; settle?: number } = {}) => {
    const { w = 1440, h = 900, dpr = 1, settle = 3 } = opts;
    const st = xp.stage;
    const r = st.renderer;
    const prev = { w: innerWidth, h: innerHeight, dpr: r.getPixelRatio() };
    if (opts.night !== undefined) xp.setNight(opts.night, true);
    r.setPixelRatio(dpr);
    r.setSize(w, h, false);
    st.post.setSize(w * dpr, h * dpr);
    st.camera.aspect = w / h;
    st.backCamera.aspect = w / h;
    (st as unknown as { backRT: { setSize: (a: number, b: number) => void } }).backRT.setSize((w * dpr) / 2, (h * dpr) / 2);
    xp.scroll.p = xp.scroll.target = xp.timeline.scroll(p);
    for (let i = 0; i < settle; i++) {
      xp.pose(p);
      xp.animate(p, 1);
      xp.tower.update(xp.time);
      xp.city.update();
      xp.render();
    }
    const data = (r.domElement as HTMLCanvasElement).toDataURL("image/jpeg", 0.9);
    await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: "POST", body: data });
    r.setPixelRatio(prev.dpr);
    st.resize();
    return name;
  };
  /**
   * Mesure : temps GPU réel d'une image (requêtes de minuterie), temps CPU de
   * la mise à jour et du rendu, draw calls, triangles.
   */
  const perf = async (p: number, frames = 60) => {
    const r = xp.stage.renderer;
    const gl = r.getContext() as WebGL2RenderingContext;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    xp.scroll.p = xp.scroll.target = xp.timeline.scroll(p);
    for (let i = 0; i < 8; i++) {
      xp.pose(p);
      xp.animate(p, 1 / 60);
      xp.render();
    }
    r.info.autoReset = false;
    const cpu: number[] = [];
    const queries: WebGLQuery[] = [];
    for (let i = 0; i < frames; i++) {
      r.info.reset();
      const q = ext ? gl.createQuery()! : null;
      if (q && ext) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      const t0 = performance.now();
      xp.pose(p);
      xp.animate(p, 1 / 60);
      xp.tower.update(xp.time);
      xp.city.update();
      xp.render();
      cpu.push(performance.now() - t0);
      if (q && ext) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        queries.push(q);
      }
      await new Promise((res) => setTimeout(res, 0));
    }
    const info = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    r.info.autoReset = true;
    const gpu: number[] = [];
    for (const q of queries) {
      for (let k = 0; k < 200 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((res) => setTimeout(res, 5));
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    const med = (a: number[]) => (a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(2) : -1);
    // Débit : N images d'affilée puis synchronisation (temps par image quand le GPU limite).
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      xp.pose(p);
      xp.animate(p, 1 / 60);
      xp.render();
    }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const throughput = +((performance.now() - t0) / frames).toFixed(2);
    return { p, frame: throughput, gpu: med(gpu), cpu: med(cpu), ...info, dpr: +r.getPixelRatio().toFixed(2) };
  };
  Object.assign(window, { __xp: xp, __shot: shot, __perf: perf });
}
