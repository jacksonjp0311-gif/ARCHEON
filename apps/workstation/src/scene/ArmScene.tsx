import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { Edges, Line, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { explosionOffset, renderTransform } from '@archeon/scene-engine';
import { useUi } from '../store';
import type { Part } from '@archeon/design-protocol';

const STEEL = '#8aa3b3';
const ICE = '#9ec9dc';
const ORANGE = '#ff981b';

function provenanceTint(cls: string): string {
  switch (cls) {
    case 'SOURCE': return '#62f2a4';
    case 'DERIVED': return '#5ce1ff';
    case 'GENERATED': return '#9ec9dc';
    case 'ASSUMED': return '#c9b07a';
    case 'UNVERIFIED': return '#e6b84c';
    case 'VALIDATED': return '#6ce391';
    default: return STEEL;
  }
}

function meshUrl(part: Part): string | null {
  const cad = part.spatial.cad;
  if (!cad) return null;
  const rel = cad.preview || (cad.format === 'stl' ? cad.path : null);
  if (!rel) return null;
  return `/api/media/${rel.split('\\').join('/')}`;
}

function StlMesh({
  url,
  color,
  opacity,
  ghost,
  selected,
  clip
}: {
  url: string;
  color: string;
  opacity: number;
  ghost?: boolean;
  selected: boolean;
  clip: THREE.Plane[];
}) {
  const geom = useLoader(STLLoader, url);
  useMemo(() => {
    geom.computeVertexNormals();
    geom.center();
  }, [geom]);
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 0.95}
        opacity={opacity}
        wireframe={!!ghost}
        metalness={0.35}
        roughness={0.45}
        clippingPlanes={clip}
      />
      {!ghost && <Edges threshold={15} color={selected ? ORANGE : '#173445'} />}
    </mesh>
  );
}

function Solid({
  part,
  selected,
  ghost,
  xray,
  cutaway,
  offset
}: {
  part: Part;
  selected: boolean;
  ghost?: boolean;
  xray: boolean;
  cutaway: boolean;
  offset: [number, number, number];
}) {
  const pos = renderTransform(part.spatial.origin_m, offset);
  const prim = part.spatial.primitive;
  const color = selected ? ORANGE : ghost ? ORANGE : provenanceTint(part.provenance.class);
  const opacity = ghost ? 0.35 : xray ? 0.22 : 0.92;
  const clip = cutaway ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.002)] : [];
  const rot = part.spatial.rpy_rad as [number, number, number];
  const cadUrl = meshUrl(part);
  return (
    <group
      position={pos}
      rotation={rot}
      onClick={(e) => {
        e.stopPropagation();
        useUi.getState().setSelected(part.id);
      }}
    >
      {cadUrl ? (
        <Suspense fallback={null}>
          <StlMesh url={cadUrl} color={color} opacity={opacity} ghost={ghost} selected={selected} clip={clip} />
        </Suspense>
      ) : prim.kind === 'box' ? (
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            useUi.getState().setSelected(part.id);
          }}
        >
          <boxGeometry args={[prim.sx, prim.sy, prim.sz]} />
          <meshStandardMaterial
            color={color}
            transparent={opacity < 0.95}
            opacity={opacity}
            wireframe={!!ghost}
            metalness={0.35}
            roughness={0.45}
            clippingPlanes={clip}
            clipShadows
          />
          {!ghost && <Edges threshold={15} color={selected ? ORANGE : '#173445'} />}
        </mesh>
      ) : (
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            useUi.getState().setSelected(part.id);
          }}
        >
          <cylinderGeometry args={[prim.radius, prim.radius, prim.height, 28]} />
          <meshStandardMaterial
            color={color}
            transparent={opacity < 0.95}
            opacity={opacity}
            wireframe={!!ghost}
            metalness={0.4}
            roughness={0.4}
            clippingPlanes={clip}
          />
          {!ghost && <Edges threshold={15} color={selected ? ORANGE : '#173445'} />}
        </mesh>
      )}
    </group>
  );
}

export function ArmScene({
  parts,
  ports,
  proposalParts
}: {
  parts: Part[];
  ports: { id: string; origin_m: [number, number, number]; host: string }[];
  proposalParts: Part[] | null;
}) {
  const selected = useUi((s) => s.selectedId);
  const explosion = useUi((s) => s.explosion);
  const strategy = useUi((s) => s.strategy);
  const view = useUi((s) => s.view);
  const isolate = useUi((s) => s.isolate);
  const xray = view === 'X_RAY';
  const cutaway = view === 'CUTAWAY';
  const showIfaces = view === 'INTERFACES' || view === 'CONSTRAINTS';
  const seqLen = parts.length;

  const visible = useMemo(() => {
    if (view === 'ISOLATE' && isolate) {
      const hit = parts.find((p) => p.id === isolate);
      if (!hit) return parts;
      return parts.filter((p) => p.id === isolate || p.parent === hit.parent || p.id === hit.parent);
    }
    return parts;
  }, [parts, view, isolate]);

  return (
    <Canvas
      gl={{ antialias: true, localClippingEnabled: true }}
      camera={{ position: [1.35, 0.85, 0.95], fov: 42, near: 0.01, far: 40 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <color attach="background" args={['#050b12']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      <directionalLight position={[-2, 1, -1]} intensity={0.25} color={ICE} />
      <gridHelper args={[3, 30, '#1f4c64', '#0c1c2a']} position={[0.4, 0, 0]} />
      <axesHelper args={[0.25]} />
      <Suspense fallback={null}>
      {visible.map((p) => {
        const off = explosionOffset(
          {
            id: p.id,
            origin_m: p.spatial.origin_m,
            explosion_vector: p.spatial.explosion_vector,
            explosion_distance_m: p.spatial.explosion_distance_m,
            assembly_stage: p.spatial.assembly_stage
          },
          strategy,
          explosion,
          seqLen
        );
        return (
          <Solid
            key={p.id}
            part={p}
            selected={selected === p.id}
            xray={xray}
            cutaway={cutaway}
            offset={off}
          />
        );
      })}
      {proposalParts &&
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
              ghost
              xray={false}
              cutaway={false}
              offset={[0, 0, 0]}
            />
          );
        })}
      {showIfaces &&
        ports.map((port) => (
          <mesh key={port.id} position={port.origin_m}>
            <octahedronGeometry args={[0.012, 0]} />
            <meshBasicMaterial color="#38d7ff" />
          </mesh>
        ))}
      </Suspense>
      {showIfaces && ports.length > 1 && (
        <Line
          points={ports.map((p) => p.origin_m)}
          color="#38d7ff"
          lineWidth={1}
          transparent
          opacity={0.35}
        />
      )}
      <OrbitControls makeDefault target={[0.4, 0.12, 0.05]} enableDamping={false} />
    </Canvas>
  );
}
