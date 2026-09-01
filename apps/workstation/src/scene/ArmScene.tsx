import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Html, Line, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import {
  focusOffset,
  getEntityWorldBounds,
  getFinalRenderTransform,
  getScopeBounds,
  hierarchicalOffsets,
  partsInScope,
  primitiveSize,
  resolveFitIntent,
  transformHostPoint
} from '@archeon/scene-engine';
import { useUi } from '../store';
import type { Part } from '@archeon/design-protocol';

const ORANGE = '#ff981b';
const ICE = '#9ec9dc';

type MatClass = 'ALUMINUM' | 'STEEL' | 'UNKNOWN';

function matClass(part: Part): MatClass {
  const id = (part.material ?? '').toLowerCase();
  if (id.includes('al') || id.includes('6061')) return 'ALUMINUM';
  if (id.includes('steel')) return 'STEEL';
  return 'UNKNOWN';
}

function pbr(cls: MatClass, overlayProvenance?: string) {
  if (overlayProvenance) {
    return { color: overlayProvenance, metalness: 0.35, roughness: 0.45 };
  }
  switch (cls) {
    case 'ALUMINUM':
      return { color: '#c5d0d8', metalness: 0.82, roughness: 0.28 };
    case 'STEEL':
      return { color: '#8d969f', metalness: 0.9, roughness: 0.38 };
    default:
      return { color: '#7a8792', metalness: 0.42, roughness: 0.55 };
  }
}

function provenanceTint(cls: string): string {
  switch (cls) {
    case 'SOURCE': return '#62f2a4';
    case 'DERIVED': return '#5ce1ff';
    case 'GENERATED': return '#9ec9dc';
    case 'ASSUMED': return '#c9b07a';
    case 'UNVERIFIED': return '#e6b84c';
    default: return '#8aa3b3';
  }
}

function meshUrl(part: Part): string | null {
  const cad = part.spatial.cad;
  if (!cad) return null;
  const rel = cad.preview || (cad.format === 'stl' ? cad.path : null);
  if (!rel) return null;
  const rev = useUi.getState().geomRev;
  return `/api/media/${rel.split('\\').join('/')}?g=${rev}`;
}

function StlMesh({ url, material, opacity, wire, clip }: { url: string; material: ReturnType<typeof pbr>; opacity: number; wire?: boolean; clip: THREE.Plane[] }) {
  const geom = useLoader(STLLoader, url);
  useMemo(() => {
    geom.computeVertexNormals();
    geom.center();
  }, [geom]);
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
        transparent={opacity < 0.96}
        opacity={opacity}
        wireframe={!!wire}
        clippingPlanes={clip}
        envMapIntensity={0.7}
      />
    </mesh>
  );
}

function Solid({
  part,
  selected,
  hovered,
  tracked,
  neighbor,
  ghosted,
  xray,
  cutaway,
  wire,
  provenanceOverlay,
  proposal,
  offset
}: {
  part: Part;
  selected: boolean;
  hovered: boolean;
  tracked: boolean;
  neighbor: boolean;
  ghosted: boolean;
  xray: boolean;
  cutaway: boolean;
  wire: boolean;
  provenanceOverlay: boolean;
  proposal: boolean;
  offset: [number, number, number];
}) {
  const pos = getFinalRenderTransform(part.spatial.origin_m, { explosion: offset });
  const prim = part.spatial.primitive;
  const material = proposal
    ? { color: ORANGE, metalness: 0.25, roughness: 0.42 }
    : pbr(matClass(part), provenanceOverlay ? provenanceTint(part.provenance.class) : undefined);
  const opacity = proposal ? 0.38 : ghosted ? 0.12 : xray ? 0.22 : 0.96;
  const clip = cutaway ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.002)] : [];
  const rot = part.spatial.rpy_rad as [number, number, number];
  const cadUrl = meshUrl(part);
  const edge = proposal ? ORANGE : selected ? ORANGE : hovered ? ICE : neighbor ? '#38d7ff' : tracked ? '#e6b84c' : '#1c3a4c';
  return (
    <group
      position={pos}
      rotation={rot}
      onClick={(e) => {
        e.stopPropagation();
        useUi.getState().toggleSelected(part.id);
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        useUi.getState().setSelected(part.id);
        useUi.getState().setContextMenu({ x: e.clientX, y: e.clientY, id: part.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        useUi.getState().setHovered(part.id);
      }}
      onPointerOut={() => {
        if (useUi.getState().hoveredId === part.id) useUi.getState().setHovered(null);
      }}
    >
      {cadUrl ? (
        <Suspense fallback={null}>
          <StlMesh url={cadUrl} material={material} opacity={opacity} wire={wire || proposal} clip={clip} />
        </Suspense>
      ) : prim.kind === 'box' ? (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[prim.sx, prim.sy, prim.sz]} />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
            transparent={opacity < 0.96}
            opacity={opacity}
            wireframe={wire || proposal}
            clippingPlanes={clip}
            envMapIntensity={0.7}
          />
        </mesh>
      ) : (
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[prim.radius, prim.radius, prim.height, 28]} />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
            transparent={opacity < 0.96}
            opacity={opacity}
            wireframe={wire || proposal}
            clippingPlanes={clip}
            envMapIntensity={0.7}
          />
        </mesh>
      )}
      {!ghosted && <Edges threshold={18} color={edge} />}
      {(selected || hovered) && !proposal && (
        <Html center sprite occlude={false} style={{ pointerEvents: 'none' }}>
          <div className="spatial-label">
            {part.name}
            <small>{selected ? 'PART' : 'HOVER'}</small>
          </div>
        </Html>
      )}
      {tracked && !selected && (
        <mesh position={[0, prim.kind === 'box' ? prim.sz * 0.55 : prim.height * 0.55, 0]}>
          <octahedronGeometry args={[0.012, 0]} />
          <meshBasicMaterial color="#e6b84c" />
        </mesh>
      )}
    </group>
  );
}

function CameraRig() {
  const { camera } = useThree();
  const nonce = useUi((s) => s.fitNonce);
  const center = useUi((s) => s.fitCenter);
  const radius = useUi((s) => s.fitRadius);
  const goal = useRef({ c: new THREE.Vector3(0.4, 0.15, 0), p: new THREE.Vector3(1.35, 0.85, 0.95) });
  const fitting = useRef(0);
  const lastNonce = useRef(-1);
  useEffect(() => {
    const c = new THREE.Vector3(...center);
    const dist = Math.max(0.9, radius * 2.35);
    const p = c.clone().add(new THREE.Vector3(0.92, 0.58, 0.74).normalize().multiplyScalar(dist));
    goal.current = { c, p };
    if (nonce !== lastNonce.current) {
      lastNonce.current = nonce;
      fitting.current = 1;
    }
  }, [nonce, center, radius]);
  useFrame((state, dt) => {
    if (fitting.current <= 0) return;
    const k = 1 - Math.exp(-dt * 6.5);
    camera.position.lerp(goal.current.p, k);
    const controls = state.controls as { target: THREE.Vector3; update: () => void } | undefined;
    if (controls?.target) {
      controls.target.lerp(goal.current.c, k);
      controls.update();
    }
    fitting.current -= dt * 1.8;
    if (camera.position.distanceTo(goal.current.p) < 0.012) fitting.current = 0;
  });
  return null;
}

export function ArmScene({
  parts,
  ports,
  interfaces,
  assemblies,
  proposalParts,
  variantSets = []
}: {
  parts: Part[];
  ports: { id: string; origin_m: [number, number, number]; host: string }[];
  interfaces: { id: string; a: string; b: string }[];
  assemblies: { id: string; parent: string | null }[];
  proposalParts: Part[] | null;
  variantSets?: { id: string; parts: Part[] }[];
}) {
  const selected = useUi((s) => s.selectedId);
  const hovered = useUi((s) => s.hoveredId);
  const tracked = useUi((s) => s.trackedIds);
  const neighborhood = useUi((s) => s.neighborhoodIds);
  const explosion = useUi((s) => s.explosion);
  const strategy = useUi((s) => s.strategy);
  const spread = useUi((s) => s.spread);
  const spatial = useUi((s) => s.spatial);
  const style = useUi((s) => s.renderStyle);
  const overlay = useUi((s) => s.overlay);
  const isolate = useUi((s) => s.isolate);
  const ghostOthers = useUi((s) => s.ghostOthers);
  const focusId = useUi((s) => s.focusId);
  const explodeContext = useUi((s) => s.explodeContext);
  const sectionOn = useUi((s) => s.sectionOn);
  const activeVariant = useUi((s) => s.activeVariant);
  const requestFit = useUi((s) => s.requestFit);
  const xray = style === 'XRAY';
  const wire = style === 'WIREFRAME' || style === 'HIDDEN_LINE';
  const cutaway = overlay === 'ANALYSIS' && sectionOn;
  const showIfaces = overlay === 'INTERFACES' || overlay === 'CONSTRAINTS';
  const explodeLines = overlay === 'EXPLODE_LINES' || spatial === 'EXPLODED' || spatial === 'SYSTEM_EXPLODED' || spatial === 'PART_EXPLODED';

  const visible = useMemo(() => {
    if (spatial === 'ISOLATE' && isolate) {
      const scoped = partsInScope(isolate, parts, assemblies);
      if (scoped && scoped.size) return parts.filter((p) => scoped.has(p.id));
    }
    return parts;
  }, [parts, spatial, isolate, assemblies]);

  const exploding = explosion > 0.02 && (spatial.includes('EXPLOD') || !!explodeContext);
  const scopeSet = useMemo(
    () => partsInScope(explodeContext, parts, assemblies),
    [explodeContext, parts, assemblies]
  );

  const world = useMemo(() => {
    const spatialParts = visible.map((p) => ({
      id: p.id,
      origin_m: p.spatial.origin_m,
      explosion_vector: p.spatial.explosion_vector,
      explosion_distance_m: p.spatial.explosion_distance_m,
      assembly_stage: p.spatial.assembly_stage,
      parentId: p.parent,
      servicePath: p.spatial.service_path
    }));
    const map = hierarchicalOffsets(spatialParts, strategy, explosion, spread, assemblies, explodeContext);
    return visible.map((p) => {
      const explosionOff = map[p.id] ?? [0, 0, 0];
      const focus = focusOffset(p.id, p.parent, exploding ? null : focusId, exploding);
      const pos = getFinalRenderTransform(p.spatial.origin_m, { explosion: explosionOff, focus });
      const size = primitiveSize(p.spatial.primitive);
      const box = getEntityWorldBounds(pos, size, p.spatial.rpy_rad);
      return { part: p, off: explosionOff, pos, box };
    });
  }, [visible, explosion, strategy, spread, explodeContext, assemblies, focusId, exploding]);

  const worldRef = useRef(world);
  worldRef.current = world;
  const fitEpoch = useUi((s) => s.fitEpoch);
  const variantMode = useUi((s) => s.variantMode);
  const fitSig = `${spatial}|${explodeContext}|${isolate}|${focusId}|${variantMode}|${fitEpoch}`;

  useEffect(() => {
    const w = worldRef.current;
    const intent = resolveFitIntent({
      spatial,
      isolate,
      explodeContext,
      focusId,
      variantMode,
      explosion,
      explicit: useUi.getState().fitNonce ? undefined : undefined
    });
    let subset = w;
    if (intent === 'focus' && focusId) {
      subset = w.filter((x) => x.part.id === focusId || x.part.parent === focusId);
    } else if (intent === 'isolate' && isolate) {
      subset = w.filter((x) => x.part.id === isolate || x.part.parent === isolate);
    } else if (intent === 'part_exploded' && scopeSet) {
      subset = w.filter((x) => scopeSet.has(x.part.id));
    } else if (intent === 'selection' && selected) {
      subset = w.filter((x) => x.part.id === selected || x.part.parent === selected);
    }
    const boxes = (subset.length ? subset : w).map((x) => x.box);
    const fit = getScopeBounds(boxes);
    requestFit(fit.center, fit.radius * 1.15);
  }, [fitSig]);

  return (
    <Canvas
      shadows
      gl={{ antialias: true, localClippingEnabled: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [1.35, 0.85, 0.95], fov: 42, near: 0.01, far: 40 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      onPointerMissed={() => {
        useUi.getState().clearSelection();
        useUi.getState().setContextMenu(null);
        useUi.getState().setRadialOpen(false);
      }}
      onContextMenu={(e) => e.nativeEvent.preventDefault()}
    >
      <color attach="background" args={['#071018']} />
      <hemisphereLight args={['#d7eef8', '#121c24', 0.55]} />
      <directionalLight
        castShadow
        position={[2.6, 4.4, 2.2]}
        intensity={1.45}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.2}
        shadow-camera-far={16}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-2.2, 1.4, -1.6]} intensity={0.28} color="#7ec8e6" />
      <mesh rotation-x={-Math.PI / 2} position={[0.4, -0.025, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#0a141c" roughness={0.92} metalness={0.08} />
      </mesh>
      <gridHelper args={[8, 40, '#1f4c64', '#0c1c2a']} position={[0.4, 0.002, 0]} />
      <ContactShadows position={[0.4, 0, 0]} opacity={0.42} scale={9} blur={2.4} far={5} />
      <axesHelper args={[0.22]} />
      <CameraRig />
      <Suspense fallback={null}>
        {world.map(({ part: p, pos }) => {
          const ghosted =
            ghostOthers && selected != null && p.id !== selected && p.parent !== selected && !neighborhood.includes(p.id);
          const delta: [number, number, number] = [
            pos[0] - p.spatial.origin_m[0],
            pos[1] - p.spatial.origin_m[1],
            pos[2] - p.spatial.origin_m[2]
          ];
          return (
            <Solid
              key={p.id}
              part={p}
              selected={selected === p.id}
              hovered={hovered === p.id}
              tracked={tracked.includes(p.id)}
              neighbor={neighborhood.includes(p.id)}
              ghosted={ghosted}
              xray={xray}
              cutaway={cutaway}
              wire={wire}
              provenanceOverlay={overlay === 'PROVENANCE'}
              proposal={false}
              offset={delta}
            />
          );
        })}
        {variantMode === 'SPREAD' &&
          variantSets.map((set, i) =>
            set.parts.map((p) => (
              <group key={`var-${set.id}-${p.id}`} position={[i * 0.55, 0, 0]}>
                <Solid
                  part={p}
                  selected={activeVariant === set.id}
                  hovered={false}
                  tracked={false}
                  neighbor={false}
                  ghosted={activeVariant != null && activeVariant !== set.id}
                  xray={false}
                  cutaway={false}
                  wire
                  provenanceOverlay={false}
                  proposal
                  offset={[0, 0, 0]}
                />
              </group>
            ))
          )}
        {proposalParts && variantMode !== 'SPREAD' &&
          proposalParts.map((p) => {
            const orig = parts.find((o) => o.id === p.id);
            if (!orig) return null;
            const same =
              JSON.stringify(orig.spatial.primitive) === JSON.stringify(p.spatial.primitive) &&
              orig.spatial.origin_m.every((v, i) => Math.abs(v - p.spatial.origin_m[i]) < 1e-9);
            if (same) return null;
            return (
              <Solid
                key={`ghost-${p.id}`}
                part={p}
                selected={false}
                hovered={false}
                tracked={false}
                neighbor={false}
                ghosted={false}
                xray={false}
                cutaway={false}
                wire
                provenanceOverlay={false}
                proposal
                offset={[0, 0, 0.02]}
              />
            );
          })}
      </Suspense>
      {explodeLines && explosion > 0.04 &&
        world
          .filter(({ part: p, off }) => {
            if (Math.hypot(...off) < 1e-4) return false;
            if (scopeSet) return scopeSet.has(p.id);
            return true;
          })
          .map(({ part: p, pos }) => (
            <Line
              key={`line-${p.id}`}
              points={[p.spatial.origin_m, pos]}
              color={selected === p.id ? ORANGE : ICE}
              lineWidth={selected === p.id ? 1.4 : 0.7}
              transparent
              opacity={selected === p.id ? 0.85 : 0.28}
            />
          ))}
      {showIfaces &&
        ports.map((port) => {
          const host = world.find((w) => w.part.id === port.host);
          const pos = host
            ? transformHostPoint(port.origin_m, host.part.spatial.origin_m, host.pos, host.part.spatial.rpy_rad)
            : port.origin_m;
          return (
            <mesh key={port.id} position={pos}>
              <octahedronGeometry args={[0.012, 0]} />
              <meshBasicMaterial color="#38d7ff" />
            </mesh>
          );
        })}
      {showIfaces &&
        interfaces.map((iface) => {
          const a = ports.find((p) => p.id === iface.a);
          const b = ports.find((p) => p.id === iface.b);
          if (!a || !b) return null;
          const ha = world.find((w) => w.part.id === a.host);
          const hb = world.find((w) => w.part.id === b.host);
          const pa = ha ? transformHostPoint(a.origin_m, ha.part.spatial.origin_m, ha.pos, ha.part.spatial.rpy_rad) : a.origin_m;
          const pb = hb ? transformHostPoint(b.origin_m, hb.part.spatial.origin_m, hb.pos, hb.part.spatial.rpy_rad) : b.origin_m;
          const hot = neighborhood.includes(iface.id) || neighborhood.includes(a.host) || neighborhood.includes(b.host);
          return (
            <Line
              key={`iface-${iface.id}`}
              points={[pa, pb]}
              color={hot ? ORANGE : '#38d7ff'}
              lineWidth={hot ? 1.6 : 1}
              transparent
              opacity={hot ? 0.9 : 0.4}
            />
          );
        })}
      <OrbitControls makeDefault target={[0.4, 0.15, 0]} enableDamping={false} />
    </Canvas>
  );
}


