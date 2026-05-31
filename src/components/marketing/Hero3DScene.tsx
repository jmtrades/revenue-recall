"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The actual WebGL hero centerpiece — a floating, slowly-rotating faceted
 * monolith ("the engine") lit in brand-green with a soft rim glow, sitting on a
 * dark reflective plane. Cinematic and on-brand without needing any external 3D
 * model file (the geometry + materials are generated in code, so nothing to
 * download or license).
 *
 * Built to ship safely on a SaaS:
 *  - capped devicePixelRatio (≤2) so phones don't render at 3x and stutter,
 *  - pauses the render loop when scrolled off-screen (IntersectionObserver),
 *  - honors prefers-reduced-motion (renders a single static frame, no loop),
 *  - full teardown on unmount (no leaked GL context / RAF).
 *
 * Loaded via next/dynamic({ ssr:false }) behind a static fallback, so a device
 * without WebGL simply keeps the fallback and nothing breaks.
 */
export default function Hero3DScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = mount.clientWidth || 560;
    const height = mount.clientHeight || 460;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 7);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL — fallback stays
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Brand palette
    const GREEN = new THREE.Color("#16c98d");
    const DEEP = new THREE.Color("#0a0f0d");

    // Lighting — a key green light + cool fill + a warm rim for dimension.
    scene.add(new THREE.AmbientLight(0x2a3a34, 0.7));
    const key = new THREE.DirectionalLight(GREEN, 2.4);
    key.position.set(4, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fffd0, 1.4);
    rim.position.set(-6, 2, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0x123, 1.2, 30);
    fill.position.set(0, -3, 4);
    scene.add(fill);

    // The centerpiece: an icosahedron given a faceted, premium metal look.
    const geo = new THREE.IcosahedronGeometry(1.7, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0d231b"),
      metalness: 0.85,
      roughness: 0.22,
      emissive: GREEN,
      emissiveIntensity: 0.42,
      flatShading: true,
    });
    const core = new THREE.Mesh(geo, mat);
    scene.add(core);

    // A bright glowing wireframe shell just outside it — the "energy" layer.
    const shellGeo = new THREE.IcosahedronGeometry(2.0, 1);
    const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#3dffb8"), wireframe: true, transparent: true, opacity: 0.32 });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    // Inner glow core — a soft emissive sphere that makes the object read as lit
    // from within even on software renderers / weak GPUs.
    const glowGeo = new THREE.IcosahedronGeometry(1.45, 2);
    const glowMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.12 });
    const glowCore = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowCore);

    // Floating particles for depth/atmosphere.
    const pCount = 90;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({ color: GREEN, size: 0.045, transparent: true, opacity: 0.55, sizeAttenuation: true });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Pointer parallax — the object subtly follows the cursor (desktop delight).
    let targetX = 0;
    let targetY = 0;
    function onPointer(e: PointerEvent) {
      const r = mount!.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let visible = true;
    const clock = new THREE.Clock();

    function frame() {
      const t = clock.getElapsedTime();
      core.rotation.y = t * 0.28 + targetX;
      core.rotation.x = Math.sin(t * 0.4) * 0.12 + targetY;
      core.position.y = Math.sin(t * 0.9) * 0.12;
      shell.rotation.y = -t * 0.18;
      shell.rotation.z = t * 0.1;
      particles.rotation.y = t * 0.05;
      renderer.render(scene, camera);
      if (visible) raf = requestAnimationFrame(frame);
    }

    if (reduce) {
      renderer.render(scene, camera); // one static frame, no loop
    } else {
      raf = requestAnimationFrame(frame);
    }

    // Pause when off-screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !reduce && !raf) raf = requestAnimationFrame(frame);
        if (!visible && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.01 },
    );
    io.observe(mount);

    function onResize() {
      const w = mount!.clientWidth || width;
      const h = mount!.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      geo.dispose();
      mat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" aria-hidden />;
}
