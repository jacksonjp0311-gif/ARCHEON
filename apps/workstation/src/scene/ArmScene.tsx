import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import {
  alignEyeDirection,
  CAMERA_UP_Z,
  engineeringGroundFromBounds,
  fitDistanceForAabb,
  geometryMode,
  getRenderedEntityBounds,
  getScopeBounds,
  hierarchicalOffsets,
  overlayVisible,
  partsInScope,
  focusOffset,
  getFinalRenderTransform,
  resolveFitIntent,
  sanitizeEdgeSegments,
  validateAabb,
  worldPortFromLocal
} from '@archeon/scene-engine';
import { useUi } from '../store';
import { localInterfaceGraph, type Feature, type Joint, type Part } from '@archeon/design-protocol';
import type { RenderDebug } from '../store';

const GOLD = '#D6A33A';
const GOLD_HI = '#F0C45C';
const GOLD_DIM = '#7E5B1E';
const LAVENDER = '#A779FF';
const LAVENDER_HI = '#C7A8FF';
const EDGE_IDLE = '#6A6E74';
const DATUM = '#8A8680';
const VALID = '#5dba7a';
const WARNING = '#c9a227';

type MatClass =
  | 'MACHINED_ALUMINUM'
  | 'ANODIZED_BLACK_ALUMINUM'
  | 'STEEL'
  | 'STAINLESS_STEEL'
  | 'BLACK_OXIDE_STEEL'
  | 'POLYMER'
  | 'RUBBER'
  | 'COMPOSITE'
  | 'UNKNOWN';

function matClass(part: Part): MatClass {
  const id = `${part.material ?? ''} ${(part as Part & { appearance?: string }).appearance ?? ''}`.toLowerCase();
  if (id.includes('anodiz') || id.includes('al_anod')) return 'ANODIZED_BLACK_ALUMINUM';
  if (id.includes('black') || id.includes('oxide')) return 'BLACK_OXIDE_STEEL';
  if (id.includes('stainless')) return 'STAINLESS_STEEL';
  if (id.includes('rubber') || id.includes('elastomer')) return 'RUBBER';
  if (id.includes('polymer') || id.includes('plastic')) return 'POLYMER';
  if (id.includes('composite')) return 'COMPOSITE';
  if (id.includes('al') || id.includes('6061')) return 'MACHINED_ALUMINUM';
  if (id.includes('steel') || id.includes('bearing')) return 'STEEL';
  return 'UNKNOWN';
}

function pbr(cls: MatClass, overlayProvenance?: string) {
  if (overlayProvenance) {
    return { color: overlayProvenance, metalness: 0.35, roughness: 0.45, env: 0.6 };
  }
  switch (cls) {
    case 'MACHINED_ALUMINUM':
      return { color: '#cfd6db', metalness: 0.88, roughness: 0.18, env: 1.25 };
    case 'ANODIZED_BLACK_ALUMINUM':
      return { color: '#2c3138', metalness: 0.48, roughness: 0.28, env: 1.05 };
    case 'STEEL':
      return { color: '#9aa3ab', metalness: 0.92, roughness: 0.28, env: 1.15 };
    case 'STAINLESS_STEEL':
      return { color: '#d0d5d2', metalness: 0.9, roughness: 0.2, env: 1.3 };
    case 'BLACK_OXIDE_STEEL':
      return { color: '#3a3d42', metalness: 0.78, roughness: 0.36, env: 0.95 };
    case 'POLYMER':
      return { color: '#6e6862', metalness: 0.06, roughness: 0.58, env: 0.35 };
    case 'RUBBER':
      return { color: '#2c2a28', metalness: 0.04, roughness: 0.82, env: 0.2 };
    case 'COMPOSITE':
      return { color: '#4e463e', metalness: 0.14, roughness: 0.5, env: 0.4 };
    default:
      return { color: '#8a9096', metalness: 0.4, roughness: 0.5, env: 0.55 };
  }
}

function provenanceTint(cls: string): string {
  switch (cls) {
    case 'SOURCE':
    case 'VALIDATED':
      return VALID;
    case 'DERIVED':
    case 'GENERATED':
      return '#b8b4ac';
    case 'ASSUMED':
      return WARNING;
    case 'UNVERIFIED':
      return WARNING;
    default:
      return '#8a9096';
  }
}

function StudioRig({ agentAccent }: { agentAccent: boolean }) {
  return (
    <>
      <color attach="background" args={['#030303']} />
      <hemisphereLight args={['#e8e4dc', '#17181B', 0.38]} position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]} />
      <directionalLight
        castShadow
        position={[2.4, 2.6, 3.9]}
        intensity={1.7}
        color="#fff3e4"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.2}
        shadow-camera-far={16}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-2.6, -1.4, 1.5]} intensity={0.48} color="#d8dce2" />
      <directionalLight position={[-0.4, 3.4, 1.8]} intensity={0.22} color="#F0C45C" />
      {agentAccent && <directionalLight position={[0.2, -2.8, 2.4]} intensity={0.09} color="#A779FF" />}
      <Environment preset="warehouse" environmentIntensity={0.32} />
    </>
  );
}

function meshUrl(part: Part): string | null {
  const cad = part.spatial.cad;
  if (!cad) return null;
  const rel = cad.preview || (cad.format === 'stl' ? cad.path : null);
  if (!rel) return null;
  const rev = useUi.getState().geomRev;
  return `/api/media/${rel.split('\\').join('/')}?g=${rev}`;
}

/**
 * Technical edges as a child of <mesh>, never of <group>.
 * drei <Edges> on a Group keeps a 1 m placeholder Line2 ([0,0,0]→[1,0,0])
 * because Group has no geometry — that was the stray gray line around every part.
 */
function TechnicalEdges({ color, threshold = 28 }: { color: string; threshold?: number }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const parent = line.parent as THREE.Mesh | null;
    const src = parent?.geometry;
    if (!src) return;
    if (line.userData.edgeSrc === src.uuid && line.userData.edgeTh === threshold) return;
    src.computeBoundingBox();
    const bb = src.boundingBox;
    const diag = bb ? bb.min.distanceTo(bb.max) : 0.1;
    const maxLen = Math.min(2, Math.max(0.015, diag * 1.25));
    const edges = new THREE.EdgesGeometry(src, threshold);
    const pos = edges.getAttribute('position');
    const filtered = pos ? sanitizeEdgeSegments(pos.array as ArrayLike<number>, maxLen) : [];
    edges.dispose();
    const g = new THREE.BufferGeometry();
    if (filtered.length >= 6) {
      g.setAttribute('position', new THREE.Float32BufferAttribute(filtered, 3));
    }
    const prev = line.geometry;
    line.geometry = g;
    if (prev && prev !== g) prev.dispose();
    line.userData.edgeSrc = src.uuid;
    line.userData.edgeTh = threshold;
  });
  return (
    <lineSegments ref={lineRef} raycast={() => null}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function StlMesh({
  url,
  partId,
  material,
  opacity,
  wire,
  clip,
  edgeColor,
  showEdges,
  castShadow
}: {
  url: string;
  partId: string;
  material: ReturnType<typeof pbr>;
  opacity: number;
  wire?: boolean;
  clip: THREE.Plane[];
  edgeColor: string;
  showEdges: boolean;
  castShadow: boolean;
}) {
  const geom = useLoader(STLLoader, url);
  useEffect(() => {
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return;
    const idx = geom.getIndex();
    const tris = idx ? idx.count / 3 : geom.getAttribute('position').count / 3;
    useUi.getState().setMeshBounds(partId, {
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      triangles: Math.max(0, Math.round(tris))
    });
  }, [geom, partId]);
  return (
    <mesh geometry={geom} castShadow={castShadow} receiveShadow={castShadow}>
      <meshStandardMaterial
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
        transparent={opacity < 0.96}
        opacity={opacity}
        wireframe={!!wire}
        clippingPlanes={clip}
        envMapIntensity={material.env ?? 1}
      />
      {showEdges && <TechnicalEdges color={edgeColor} threshold={36} />}
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
  offset,
  debug
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
  debug: RenderDebug;
}) {
  const pos = getFinalRenderTransform(part.spatial.origin_m, { explosion: offset });
  const prim = part.spatial.primitive;
  const physical = pbr(matClass(part), provenanceOverlay ? provenanceTint(part.provenance.class) : undefined);
  const material = physical;
  const opacity = proposal ? 0.34 : ghosted ? 0.12 : xray ? 0.22 : 0.98;
  const sectionAxis = useUi.getState().sectionAxis;
  const sectionPos = useUi.getState().sectionPos;
  const n =
    sectionAxis === 'x'
      ? new THREE.Vector3(-1, 0, 0)
      : sectionAxis === 'y'
        ? new THREE.Vector3(0, -1, 0)
        : new THREE.Vector3(0, 0, -1);
  const clip = cutaway ? [new THREE.Plane(n, sectionPos || 0.002)] : [];
  const rot = part.spatial.rpy_rad as [number, number, number];
  const cadUrl = meshUrl(part);
  const mode = geometryMode(!!cadUrl, debug);
  const warn = part.provenance.class === 'UNVERIFIED' || part.provenance.class === 'ASSUMED';
  const edge = proposal
    ? LAVENDER
    : selected
      ? GOLD
      : hovered
        ? GOLD_HI
        : neighbor
          ? LAVENDER_HI
          : warn && provenanceOverlay
            ? WARNING
            : EDGE_IDLE;
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
      {mode === 'cad' && cadUrl && (
        <Suspense fallback={null}>
          <StlMesh
            url={cadUrl}
            partId={part.id}
            material={material}
            opacity={opacity}
            wire={wire || proposal}
            clip={clip}
            edgeColor={edge}
            showEdges={debug.edges && !ghosted}
            castShadow={debug.shadows}
          />
        </Suspense>
      )}
      {mode === 'primitive' && prim.kind === 'box' && (
        <mesh castShadow={debug.shadows} receiveShadow={debug.shadows}>
          <boxGeometry args={[prim.sx, prim.sy, prim.sz]} />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
            transparent={opacity < 0.96}
            opacity={opacity}
            wireframe={wire || proposal}
            clippingPlanes={clip}
            envMapIntensity={material.env ?? 1}
          />
          {debug.edges && !ghosted && <TechnicalEdges color={edge} threshold={22} />}
        </mesh>
      )}
      {mode === 'primitive' && prim.kind === 'cylinder' && (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={debug.shadows} receiveShadow={debug.shadows}>
          <cylinderGeometry args={[prim.radius, prim.radius, prim.height, 48]} />
          <meshStandardMaterial
            color={material.color}
            metalness={material.metalness}
            roughness={material.roughness}
            transparent={opacity < 0.96}
            opacity={opacity}
            wireframe={wire || proposal}
            clippingPlanes={clip}
            envMapIntensity={material.env ?? 1}
          />
          {debug.edges && !ghosted && <TechnicalEdges color={edge} threshold={28} />}
        </mesh>
      )}
      {(selected || hovered) && !proposal && (
        <Html center sprite occlude={false} style={{ pointerEvents: 'none' }}>
          <div className="spatial-label">
            {part.name}
            <small>{selected ? 'PART' : 'HOVER'}</small>
          </div>
        </Html>
      )}
      {tracked && !selected && (
        <mesh position={[0, 0, prim.kind === 'box' ? prim.sz * 0.55 : prim.height * 0.55]}>
          <octahedronGeometry args={[0.012, 0]} />
          <meshBasicMaterial color={GOLD} />
        </mesh>
      )}
    </group>
  );
}

function DrawCallProbe() {
  const frames = useRef(0);
  useFrame(({ gl }) => {
    frames.current += 1;
    if (frames.current % 45 !== 0) return;
    const calls = gl.info.render.calls;
    const s = useUi.getState().renderStats;
    if (s.drawCalls !== calls) useUi.getState().setRenderStats({ ...s, drawCalls: calls });
  });
  return null;
}

function CameraRig() {
  const { camera, size } = useThree();
  const nonce = useUi((s) => s.fitNonce);
  const center = useUi((s) => s.fitCenter);
  const radius = useUi((s) => s.fitRadius);
  const fitSize = useUi((s) => s.fitSize);
  const cameraAxis = useUi((s) => s.cameraAxis);
  const goal = useRef({ c: new THREE.Vector3(0.4, 0, 0.15), p: new THREE.Vector3(1.35, 0.95, 0.85) });
  const fitting = useRef(0);
  const lastNonce = useRef(-1);
  useLayoutEffect(() => {
    camera.up.set(...CAMERA_UP_Z);
    camera.updateProjectionMatrix();
  }, [camera]);
  useEffect(() => {
    camera.up.set(...CAMERA_UP_Z);
    const c = new THREE.Vector3(...center);
    const aspect = size.width / Math.max(1, size.height);
    const fov = 'fov' in camera ? (camera as THREE.PerspectiveCamera).fov : 42;
    const dist = fitDistanceForAabb(fitSize ?? [radius * 2, radius * 2, radius * 2], fov, aspect, 0.78);
    const dir = alignEyeDirection(cameraAxis);
    const p = c.clone().add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
    goal.current = { c, p };
    if (nonce !== lastNonce.current) {
      lastNonce.current = nonce;
      fitting.current = 1;
    }
  }, [nonce, center, radius, fitSize, size.width, size.height, cameraAxis]);
  useFrame((state, dt) => {
    camera.up.set(...CAMERA_UP_Z);
    if (fitting.current <= 0) return;
    const k = 1 - Math.exp(-dt * 6.5);
    camera.position.lerp(goal.current.p, k);
    const controls = state.controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (controls?.target) {
      controls.target.lerp(goal.current.c, k);
      controls.update?.();
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
  joints,
  features,
  assemblies,
  proposalParts,
  variantSets = []
}: {
  parts: Part[];
  ports: { id: string; origin_m: [number, number, number]; host: string }[];
  interfaces: { id: string; a: string; b: string }[];
  joints: Joint[];
  features: Feature[];
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
  const overlays = useUi((s) => s.overlays);
  const isolate = useUi((s) => s.isolate);
  const ghostOthers = useUi((s) => s.ghostOthers);
  const focusId = useUi((s) => s.focusId);
  const explodeContext = useUi((s) => s.explodeContext);
  const sectionOn = useUi((s) => s.sectionOn);
  const ghostRoles = useUi((s) => s.ghostRoles);
  const activeVariant = useUi((s) => s.activeVariant);
  const requestFit = useUi((s) => s.requestFit);
  const debug = useUi((s) => s.renderDebug);
  const meshBounds = useUi((s) => s.meshBounds);
  const geomRev = useUi((s) => s.geomRev);
  const projectGround = useMemo(() => {
    const boxes = parts.map((p) => {
      const cadUrl = meshUrl(p);
      const mode = geometryMode(!!cadUrl, debug);
      const meshLocal = mode === 'cad' && meshBounds[p.id] ? { min: meshBounds[p.id].min, max: meshBounds[p.id].max } : null;
      const rb = getRenderedEntityBounds({
        origin: p.spatial.origin_m,
        rpy: p.spatial.rpy_rad,
        primitive: p.spatial.primitive,
        meshLocal
      });
      return { min: rb.min, max: rb.max };
    });
    return engineeringGroundFromBounds(boxes);
  }, [parts, meshBounds, debug, geomRev]);
  const xray = style === 'XRAY';
  const wire = style === 'WIREFRAME' || style === 'HIDDEN_LINE';
  const cutaway = sectionOn;
  const showIfaces = overlayVisible(overlays.interfaces || overlays.mates || overlays.constraints, debug.interfaces);
  const explodeLines = overlayVisible(overlays.explodeTrails, debug.trails);
  const showDatums = overlayVisible(overlays.datums, debug.datums);
  const localGraph = useMemo(
    () => localInterfaceGraph(selected, parts, ports, interfaces),
    [selected, parts, ports, interfaces]
  );

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
      const cadUrl = meshUrl(p);
      const mode = geometryMode(!!cadUrl, debug);
      const meshLocal = mode === 'cad' && meshBounds[p.id] ? { min: meshBounds[p.id].min, max: meshBounds[p.id].max } : null;
      const rb = getRenderedEntityBounds({
        origin: pos,
        rpy: p.spatial.rpy_rad,
        primitive: p.spatial.primitive,
        meshLocal
      });
      return { part: p, off: explosionOff, pos, box: { min: rb.min, max: rb.max }, rb, mode };
    });
  }, [visible, explosion, strategy, spread, explodeContext, assemblies, focusId, exploding, meshBounds, debug, geomRev]);

  const worldRef = useRef(world);
  worldRef.current = world;
  const fitEpoch = useUi((s) => s.fitEpoch);
  const variantMode = useUi((s) => s.variantMode);
  const meshBoundCount = Object.keys(meshBounds).length;
  const fitSig = `${spatial}|${explodeContext}|${isolate}|${focusId}|${variantMode}|${fitEpoch}|${meshBoundCount}|${geomRev}`;

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
    const pool = subset.length ? subset : w;
    const boxes = pool.filter((x) => validateAabb(x.box).ok).map((x) => x.box);
    const fit = getScopeBounds(boxes);
    const sz: [number, number, number] = [
      Math.max(0.08, fit.max[0] - fit.min[0]),
      Math.max(0.08, fit.max[1] - fit.min[1]),
      Math.max(0.08, fit.max[2] - fit.min[2])
    ];
    requestFit(fit.center, fit.radius, sz);
  }, [fitSig]);

  useEffect(() => {
    let cad = 0;
    let prim = 0;
    let tris = 0;
    let largestId: string | null = null;
    let largestVol = -1;
    let largestSize: [number, number, number] = [0, 0, 0];
    for (const w of world) {
      if (w.mode === 'cad') cad += 1;
      else if (w.mode === 'primitive') prim += 1;
      const mb = meshBounds[w.part.id];
      if (mb) tris += mb.triangles;
      const vol = w.rb.size[0] * w.rb.size[1] * w.rb.size[2];
      if (vol > largestVol) {
        largestVol = vol;
        largestId = w.part.id;
        largestSize = w.rb.size;
      }
    }
    const fit = getScopeBounds(world.filter((x) => validateAabb(x.box).ok).map((x) => x.box));
    const prev = useUi.getState().renderStats;
    useUi.getState().setRenderStats({
      visibleParts: world.length,
      cadMeshes: cad,
      primitiveFallbacks: prim,
      triangles: tris,
      drawCalls: prev.drawCalls,
      edgesEnabled: debug.edges,
      sceneSize: [
        Math.max(0, fit.max[0] - fit.min[0]),
        Math.max(0, fit.max[1] - fit.min[1]),
        Math.max(0, fit.max[2] - fit.min[2])
      ],
      largestId,
      largestSize,
      geomRev
    });
  }, [world, debug.edges, meshBounds, geomRev]);

  return (
    <Canvas
      shadows
      gl={{ antialias: true, localClippingEnabled: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.18 }}
      camera={{ position: [1.35, 0.95, 0.85], up: CAMERA_UP_Z, fov: 42, near: 0.01, far: 40 }}
      onCreated={({ gl, camera }) => {
        camera.up.set(...CAMERA_UP_Z);
        camera.updateProjectionMatrix();
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
      <Suspense fallback={null}>
        <StudioRig agentAccent={overlays.agentDiff || !!proposalParts} />
      </Suspense>
      <mesh position={[projectGround.x, projectGround.y, projectGround.z]} receiveShadow renderOrder={-2}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial
          color="#080808"
          roughness={0.9}
          metalness={0.08}
          envMapIntensity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {debug.grid && (
        <Grid
          position={[projectGround.x, projectGround.y, projectGround.z + 0.001]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[12, 12]}
          cellSize={0.05}
          cellThickness={0.35}
          cellColor="#2a2c30"
          sectionSize={0.25}
          sectionThickness={0.9}
          sectionColor="#7E5B1E"
          fadeDistance={3.6}
          fadeStrength={1.85}
          infiniteGrid
          side={THREE.DoubleSide}
        />
      )}
      {debug.shadows && (
        <group position={[projectGround.x, projectGround.y, projectGround.z]} rotation={[Math.PI / 2, 0, 0]}>
          <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={10} blur={2.6} far={8} />
        </group>
      )}
      <axesHelper args={[0.16]} />
      <CameraRig />
      <DrawCallProbe />
      <Suspense fallback={null}>
        {world.map(({ part: p, pos }) => {
          const roleGhost = ghostRoles.includes(p.semantic_role) || (ghostRoles.length > 0 && ghostRoles.some((r) => p.semantic_role.includes(r) || p.id.includes(r)));
          const ghosted =
            roleGhost ||
            (ghostOthers && selected != null && p.id !== selected && p.parent !== selected && !neighborhood.includes(p.id));
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
              provenanceOverlay={overlays.provenance}
              proposal={false}
              offset={delta}
              debug={debug}
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
                  debug={debug}
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
                debug={debug}
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
              key={`trail-${p.id}`}
              points={[p.spatial.origin_m, pos]}
              color={selected === p.id ? GOLD : GOLD_DIM}
              lineWidth={selected === p.id ? 1.3 : 0.7}
              transparent
              opacity={selected === p.id ? 0.8 : 0.32}
            />
          ))}
      {showIfaces &&
        ports
          .filter((port) => selected != null && (localGraph.portIds.has(port.id) || localGraph.hostIds.has(port.host)))
          .map((port) => {
            const host = world.find((w) => w.part.id === port.host);
            const pos = host
              ? worldPortFromLocal(port.origin_m, host.pos, host.part.spatial.rpy_rad)
              : port.origin_m;
            return (
              <mesh key={port.id} position={pos}>
                <octahedronGeometry args={[0.009, 0]} />
                <meshBasicMaterial color={overlays.agentDiff ? LAVENDER : GOLD} />
              </mesh>
            );
          })}
      {showIfaces &&
        interfaces
          .filter((iface) => selected != null && localGraph.ifaceIds.has(iface.id))
          .map((iface) => {
            const a = ports.find((p) => p.id === iface.a);
            const b = ports.find((p) => p.id === iface.b);
            if (!a || !b) return null;
            const ha = world.find((w) => w.part.id === a.host);
            const hb = world.find((w) => w.part.id === b.host);
            const pa = ha ? worldPortFromLocal(a.origin_m, ha.pos, ha.part.spatial.rpy_rad) : a.origin_m;
            const pb = hb ? worldPortFromLocal(b.origin_m, hb.pos, hb.part.spatial.rpy_rad) : b.origin_m;
            const hot = selected === a.host || selected === b.host || selected === iface.id;
            const color = overlays.agentDiff
              ? LAVENDER
              : hot
                ? GOLD
                : GOLD_DIM;
            return (
              <Line
                key={`iface-${iface.id}`}
                points={[pa, pb]}
                color={color}
                lineWidth={hot ? 1.5 : 0.9}
                transparent
                opacity={hot ? 0.9 : 0.45}
              />
            );
          })}
      {showDatums && selected &&
        ports
          .filter((port) => localGraph.portIds.has(port.id))
          .map((port) => {
            const host = world.find((w) => w.part.id === port.host);
            const pos = host ? worldPortFromLocal(port.origin_m, host.pos, host.part.spatial.rpy_rad) : port.origin_m;
            return (
              <mesh key={`datum-${port.id}`} position={pos}>
                <sphereGeometry args={[0.004, 8, 8]} />
                <meshBasicMaterial color={DATUM} />
              </mesh>
            );
          })}
      {showDatums &&
        joints
          .filter((joint) => joint.id === selected)
          .map((joint) => {
            const end: [number, number, number] = [
              joint.origin_m[0] + joint.axis[0] * 0.16,
              joint.origin_m[1] + joint.axis[1] * 0.16,
              joint.origin_m[2] + joint.axis[2] * 0.16
            ];
            return (
              <group key={`joint-axis-${joint.id}`}>
                <Line points={[joint.origin_m, end]} color={LAVENDER_HI} lineWidth={2.2} />
                <mesh position={joint.origin_m}>
                  <sphereGeometry args={[0.008, 12, 12]} />
                  <meshBasicMaterial color={LAVENDER} />
                </mesh>
              </group>
            );
          })}
      {selected &&
        features
          .filter((feature) => feature.id === selected)
          .map((feature) => {
            const host = world.find((entry) => entry.part.id === feature.part);
            if (!host) return null;
            const origin = new THREE.Vector3(...feature.frame.origin_m)
              .applyEuler(new THREE.Euler(...host.part.spatial.rpy_rad, 'XYZ'))
              .add(new THREE.Vector3(...host.pos));
            const axis = new THREE.Vector3(...feature.frame.axis)
              .applyEuler(new THREE.Euler(...feature.frame.rpy_rad, 'XYZ'))
              .applyEuler(new THREE.Euler(...host.part.spatial.rpy_rad, 'XYZ'))
              .normalize();
            const end = origin.clone().addScaledVector(axis, 0.1);
            return (
              <Line
                key={`feature-frame-${feature.id}`}
                points={[origin.toArray(), end.toArray()]}
                color={LAVENDER_HI}
                lineWidth={1.8}
              />
            );
          })}
      <OrbitControls makeDefault target={[0.4, 0, 0.15]} enableDamping={false} />
    </Canvas>
  );
}
