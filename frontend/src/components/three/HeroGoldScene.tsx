import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, ContactShadows, Sparkles, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/**
 * Procedural Swiss-grade 1kg Gold Bullion Ingot Geometry.
 * Generates an authentic tapered rectangular frustum with smooth corner radii
 * and beveled chamfered top/bottom edges.
 */
function buildIngotGeometry() {
  const W_base = 3.1, D_base = 1.45;
  const W_top = 2.65, D_top = 1.2;
  const H = 0.74;
  const cr = 0.13;
  const b = 0.075;
  const S = 18;
  const K = 8;
  const N = 4 * K;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < S; s++) {
    const frac = s / (S - 1);
    const y = -H / 2 + frac * H;
    let hx = (W_base / 2) * (1 - frac) + (W_top / 2) * frac;
    let hz = (D_base / 2) * (1 - frac) + (D_top / 2) * frac;

    if (y < -H / 2 + b) {
      const u = (y - (-H / 2 + b)) / b;
      const delta = b * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
      hx -= delta;
      hz -= delta;
    } else if (y > H / 2 - b) {
      const u = (y - (H / 2 - b)) / b;
      const delta = b * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
      hx -= delta;
      hz -= delta;
    }

    const corners = [
      { cx: hx - cr, cz: hz - cr, a0: 0, a1: Math.PI / 2 },
      { cx: -hx + cr, cz: hz - cr, a0: Math.PI / 2, a1: Math.PI },
      { cx: -hx + cr, cz: -hz + cr, a0: Math.PI, a1: (3 * Math.PI) / 2 },
      { cx: hx - cr, cz: -hz + cr, a0: (3 * Math.PI) / 2, a1: 2 * Math.PI },
    ];

    for (const c of corners) {
      for (let k = 0; k < K; k++) {
        const theta = c.a0 + (k / K) * (c.a1 - c.a0);
        const px = c.cx + cr * Math.cos(theta);
        const pz = c.cz + cr * Math.sin(theta);
        positions.push(px, y, pz);
        uvs.push(px / W_top + 0.5, pz / D_top + 0.5);
      }
    }
  }

  for (let s = 0; s < S - 1; s++) {
    const rowA = s * N;
    const rowB = (s + 1) * N;
    for (let j = 0; j < N; j++) {
      const jNext = (j + 1) % N;
      indices.push(rowA + j, rowB + j, rowB + jNext);
      indices.push(rowA + j, rowB + jNext, rowA + jNext);
    }
  }

  // Bottom cap
  const bCenter = positions.length / 3;
  positions.push(0, -H / 2, 0);
  uvs.push(0.5, 0.5);
  for (let j = 0; j < N; j++) {
    indices.push(bCenter, (j + 1) % N, j);
  }

  // Top cap
  const tCenter = positions.length / 3;
  positions.push(0, H / 2, 0);
  uvs.push(0.5, 0.5);
  const topRow = (S - 1) * N;
  for (let j = 0; j < N; j++) {
    indices.push(tCenter, topRow + j, topRow + ((j + 1) % N));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates high-resolution procedural Swiss hallmark stamp texture for the bullion bar.
 */
function createBullionTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1152;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Brushed gold base
  const grad = ctx.createLinearGradient(0, 0, 512, 1152);
  grad.addColorStop(0, '#E1A91B');
  grad.addColorStop(0.25, '#FFDF6D');
  grad.addColorStop(0.5, '#F5C518');
  grad.addColorStop(0.75, '#FFE885');
  grad.addColorStop(1, '#C88E08');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 1152);

  // Micro brushed metal horizontal streaks
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)';
    const y = Math.random() * 1152;
    ctx.fillRect(0, y, 512, 1 + Math.random() * 2);
  }

  // 2. Outer & Inner Beveled Stamp Border
  ctx.strokeStyle = 'rgba(90, 60, 5, 0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, 512 - 56, 1152 - 56);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, 512 - 68, 1152 - 68);

  // 3. Debossed Hallmark Stamps
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(65, 42, 4, 0.78)';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Stamped Emblem
  ctx.font = 'bold 36px serif';
  ctx.fillText('❖  ✦  ❖', 256, 105);

  ctx.font = '700 16px sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('★ ★ ★ ★ ★', 256, 140);

  // Brand Name
  ctx.font = '900 40px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('GDP TRADERS', 256, 215);

  ctx.font = '600 14px sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('SWITZERLAND', 256, 250);

  // Horizontal divider
  ctx.strokeStyle = 'rgba(90, 60, 5, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(90, 285);
  ctx.lineTo(422, 285);
  ctx.stroke();

  // Purity
  ctx.font = '900 102px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('999.9', 256, 420);

  // Category
  ctx.font = '800 28px sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText('FINE GOLD', 256, 485);

  // Weight
  ctx.font = '700 32px sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('1000 g', 256, 560);

  ctx.font = '600 16px sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('NET WEIGHT', 256, 600);

  // Decorative seal circle
  ctx.beginPath();
  ctx.arc(256, 730, 72, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(90, 60, 5, 0.55)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(256, 730, 64, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '900 36px sans-serif';
  ctx.fillText('GT', 256, 742);

  // Melter Assayer Box
  ctx.strokeStyle = 'rgba(90, 60, 5, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(100, 850, 312, 68);
  ctx.font = '700 17px sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('MELTER ASSAYER', 256, 880);
  ctx.font = '600 13px sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('CHI ESSAYEUR FONDEUR', 256, 903);

  // Serial Number Box
  ctx.fillStyle = 'rgba(40, 25, 3, 0.88)';
  ctx.font = 'bold 24px monospace';
  ctx.letterSpacing = '3px';
  ctx.fillText('№ GT • 094821', 256, 1010);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Bitcoin Commemorative Gold Coin Texture.
 */
function createBitcoinTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  grad.addColorStop(0, '#FFE885');
  grad.addColorStop(0.6, '#F5C518');
  grad.addColorStop(1, '#C88E08');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Outer beaded rim
  ctx.fillStyle = 'rgba(80, 50, 5, 0.7)';
  const rBead = 232;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) {
    ctx.beginPath();
    ctx.arc(256 + Math.cos(a) * rBead, 256 + Math.sin(a) * rBead, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner ring
  ctx.strokeStyle = 'rgba(80, 50, 5, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();

  // Bitcoin Symbol ₿
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(60, 38, 4, 0.82)';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 1.5;
  ctx.font = '900 240px sans-serif';
  ctx.fillText('₿', 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Floating Commemorative Bitcoin Coin
 */
function FloatingCoin({
  position,
  rotation,
  speed = 1.5,
  reduced,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  speed?: number;
  reduced: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => createBitcoinTexture(), []);

  useFrame((_state, delta) => {
    if (!meshRef.current || reduced) return;
    meshRef.current.rotation.y += delta * 0.65;
  });

  return (
    <group position={position} rotation={rotation}>
      <Float speed={reduced ? 0 : speed} rotationIntensity={0.4} floatIntensity={0.8}>
        <mesh ref={meshRef} castShadow>
          <cylinderGeometry args={[0.54, 0.54, 0.08, 48]} />
          <meshPhysicalMaterial
            color="#FFD740"
            metalness={0.96}
            roughness={0.18}
            clearcoat={0.6}
            clearcoatRoughness={0.15}
            envMapIntensity={2.5}
            map={texture ?? undefined}
          />
        </mesh>
      </Float>
    </group>
  );
}

/**
 * Main 1kg Gold Bullion Bar Assembly
 */
function MasterGoldBar({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const glintLight = useRef<THREE.PointLight>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const ingotGeometry = useMemo(() => buildIngotGeometry(), []);
  const stampTexture = useMemo(() => createBullionTexture(), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!reduced) {
      group.current.rotation.y += delta * 0.38;
      // Moving glint light sweeps across the beveled bar surface
      if (glintLight.current) {
        const time = state.clock.getElapsedTime();
        glintLight.current.position.x = Math.sin(time * 1.5) * 2.5;
        glintLight.current.position.z = Math.cos(time * 1.5) * 2.5;
      }
    }
    // Smooth cursor-parallax tilt
    const targetX = reduced ? 0.35 : 0.35 + pointer.current.y * 0.22;
    const targetZ = reduced ? -0.15 : -0.15 + pointer.current.x * 0.22;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
    group.current.rotation.z += (targetZ - group.current.rotation.z) * 0.06;
  });

  return (
    <group ref={group} rotation={[0.35, 0.45, -0.15]}>
      {/* Dynamic glint light for glistening specular highlights */}
      <pointLight ref={glintLight} position={[0, 1.8, 1.5]} intensity={2.5} color="#FFF2B2" distance={8} />

      {/* 1. Precision Swiss Beveled Bullion Ingot */}
      <mesh geometry={ingotGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#F5C518"
          emissive="#3D2900"
          emissiveIntensity={0.12}
          metalness={0.98}
          roughness={0.15}
          clearcoat={0.75}
          clearcoatRoughness={0.12}
          reflectivity={0.95}
          envMapIntensity={2.8}
        />
      </mesh>

      {/* 2. Recessed Mint Hallmark Stamp Plate on Top Face */}
      <mesh position={[0, 0.372, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[1.05, 2.42]} />
        <meshPhysicalMaterial
          color="#FFDF6D"
          metalness={0.96}
          roughness={0.22}
          clearcoat={0.5}
          clearcoatRoughness={0.18}
          envMapIntensity={2.4}
          map={stampTexture ?? undefined}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* 3. Subtle Inset Bevel Frame around the Hallmark */}
      <RoundedBox args={[2.52, 0.02, 1.12]} radius={0.06} smoothness={4} position={[0, 0.37, 0]}>
        <meshPhysicalMaterial
          color="#D49A15"
          metalness={0.98}
          roughness={0.25}
          clearcoat={0.4}
          envMapIntensity={2.0}
        />
      </RoundedBox>
    </group>
  );
}

export default function HeroGoldScene() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const check = () =>
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    check();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener?.('change', check);
    return () => mq.removeEventListener?.('change', check);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.8, 4.8], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      {/* Studio Lighting Rig */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 5, 3]} intensity={3.2} color="#FFF5D6" />
      <directionalLight position={[-5, 3, -4]} intensity={2.6} color="#8B5CF6" />
      <spotLight position={[0, 6, 2]} intensity={1.8} color="#FFD740" angle={0.7} penumbra={0.9} />
      <pointLight position={[-2, -2, 2]} intensity={1.2} color="#F59E0B" />

      {/* Golden Floating Particle Sparkles */}
      {!reduced && (
        <Sparkles
          count={42}
          scale={[5.5, 4.5, 4.5]}
          size={2.8}
          speed={0.4}
          opacity={0.65}
          color="#FFDF73"
        />
      )}

      {/* Hero Master Bullion Bar */}
      <group position={[0, 0.1, 0]}>
        <Float speed={reduced ? 0 : 1.3} rotationIntensity={0.2} floatIntensity={reduced ? 0 : 0.6}>
          <MasterGoldBar reduced={reduced} />
        </Float>
      </group>

      {/* Floating Accompanying Commemorative Crypto Tokens */}
      {!reduced && (
        <>
          <FloatingCoin
            position={[-2.2, 1.0, -0.5]}
            rotation={[0.4, 0.3, 0.2]}
            speed={1.8}
            reduced={reduced}
          />
          <FloatingCoin
            position={[2.1, -0.7, 0.5]}
            rotation={[-0.3, 0.5, -0.4]}
            speed={1.6}
            reduced={reduced}
          />
        </>
      )}

      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={0.45}
        scale={7}
        blur={2.4}
        far={3}
        color="#000000"
      />
      <Environment preset="city" />

      <EffectComposer>
        <Bloom
          intensity={0.65}
          luminanceThreshold={0.52}
          luminanceSmoothing={0.35}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
