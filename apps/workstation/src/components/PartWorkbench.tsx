import { Suspense, useMemo, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { Environment, Grid, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import type { Feature, Interface, Material, Part, Port } from '@archeon/design-protocol';

interface Props {
  part: Part;
  contextParts: Part[];
  materials: Material[];
  features: Feature[];
  interfaces: Interface[];
  ports: Port[];
  onClose: () => void;
  onSaveLibrary: () => Promise<void>;
}

function Primitive({ part }: { part: Part }) {
  const primitive = part.spatial.primitive;
  return (
    <mesh rotation={primitive.kind === 'cylinder' ? [Math.PI / 2, 0, 0] : undefined} castShadow receiveShadow>
      {primitive.kind === 'box'
        ? <boxGeometry args={[primitive.sx, primitive.sy, primitive.sz]} />
        : <cylinderGeometry args={[primitive.radius, primitive.radius, primitive.height, 64]} />}
      <meshStandardMaterial color="#b8bec3" metalness={0.72} roughness={0.24} />
    </mesh>
  );
}

function CadMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#c5cbd0" metalness={0.76} roughness={0.22} />
    </mesh>
  );
}

function PartView({ part, axis }: { part: Part; axis: 'FREE' | 'X' | 'Y' | 'Z' }) {
  const preview = part.spatial.cad?.preview || (part.spatial.cad?.format === 'stl' ? part.spatial.cad.path : null);
  const url = preview ? `/api/media/${preview.split('\\').join('/')}` : null;
  const p = part.spatial.primitive;
  const extent = p.kind === 'box' ? Math.max(p.sx, p.sy, p.sz) : Math.max(p.radius * 2, p.height);
  const camera = Math.max(0.18, extent * 3.2);
  const cameraPosition: [number, number, number] = axis === 'X'
    ? [camera, 0, 0]
    : axis === 'Y'
      ? [0, camera, 0]
      : axis === 'Z'
        ? [0, 0, camera]
        : [camera, camera * 0.72, camera * 0.62];
  return (
    <Canvas shadows camera={{ position: cameraPosition, up: axis === 'Z' ? [0, 1, 0] : [0, 0, 1], fov: 38, near: 0.001, far: 100 }}>
      <color attach="background" args={['#050505']} />
      <ambientLight intensity={0.45} />
      <directionalLight castShadow position={[2, 2, 3]} intensity={2.2} />
      <Environment preset="warehouse" environmentIntensity={0.45} />
      <Suspense fallback={null}>{url ? <CadMesh url={url} /> : <Primitive part={part} />}</Suspense>
      <axesHelper args={[Math.max(0.05, extent * 0.8)]} />
      <Grid
        position={[0, 0, -extent * 0.65]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[4, 4]}
        cellSize={Math.max(0.005, extent / 8)}
        cellColor="#2a2c30"
        sectionColor="#7E5B1E"
        fadeDistance={3}
      />
      <OrbitControls
        makeDefault
        enableDamping
        minDistance={extent * 0.7}
        maxDistance={extent * 12}
        enableRotate={axis === 'FREE'}
      />
    </Canvas>
  );
}

function money(value: number): string {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : 'UNVERIFIED';
}

export function PartWorkbench({ part, contextParts, materials, features, interfaces, ports, onClose, onSaveLibrary }: Props) {
  const [axis, setAxis] = useState<'FREE' | 'X' | 'Y' | 'Z'>('FREE');
  const [costOpen, setCostOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [materialRate, setMaterialRate] = useState(0);
  const [processCost, setProcessCost] = useState(0);
  const [saving, setSaving] = useState(false);
  const material = materials.find((item) => item.id === part.material);
  const primitive = part.spatial.primitive;
  const measurements = useMemo(() => {
    if (primitive.kind === 'box') {
      const volume = primitive.sx * primitive.sy * primitive.sz;
      const area = 2 * (primitive.sx * primitive.sy + primitive.sx * primitive.sz + primitive.sy * primitive.sz);
      return {
        dimensions: `${(primitive.sx * 1000).toFixed(2)} × ${(primitive.sy * 1000).toFixed(2)} × ${(primitive.sz * 1000).toFixed(2)} mm`,
        volume,
        area,
        curvature: '6 planar faces; edge radii UNSUPPORTED by primitive envelope'
      };
    }
    const volume = Math.PI * primitive.radius ** 2 * primitive.height;
    const area = 2 * Math.PI * primitive.radius * (primitive.radius + primitive.height);
    return {
      dimensions: `Ø ${(primitive.radius * 2000).toFixed(2)} × ${(primitive.height * 1000).toFixed(2)} mm`,
      volume,
      area,
      curvature: `cylindrical R ${(primitive.radius * 1000).toFixed(2)} mm (1/R ${(1 / primitive.radius).toFixed(2)} m⁻¹); end caps planar`
    };
  }, [primitive]);
  const density = material?.density_kg_m3 ?? null;
  const mass = density == null ? null : measurements.volume * density;
  const materialCost = mass == null ? null : mass * materialRate;
  const unitCost = materialCost == null ? null : materialCost + processCost;
  const featureCount = features.filter((feature) => feature.part === part.id).length;
  const localPorts = ports.filter((port) => port.host === part.id);
  const localPortIds = new Set(localPorts.map((port) => port.id));
  const localInterfaces = interfaces.filter((item) => localPortIds.has(item.a) || localPortIds.has(item.b));

  return (
    <div className="part-lab-backdrop" role="dialog" aria-modal="true" aria-label={`${part.name} engineering workspace`}>
      <section className="part-lab">
        <header className="part-lab-head">
          <div><small>ISOLATED ENGINEERING CONTEXT</small><strong>{part.name}</strong><span>{part.id}</span></div>
          <nav>
            {(['FREE', 'X', 'Y', 'Z'] as const).map((item) => <button key={item} className={axis === item ? 'active' : ''} onClick={() => setAxis(item)}>{item}</button>)}
            <button onClick={onClose}>CLOSE ×</button>
          </nav>
        </header>
        <div className="part-lab-body">
          <div className="part-lab-scene"><PartView key={axis} part={part} axis={axis} /></div>
          <aside className="part-lab-data">
            <section>
              <h3>PHYSICAL DEFINITION <em>DERIVED</em></h3>
              <dl>
                <dt>ENVELOPE</dt><dd>{measurements.dimensions}</dd>
                <dt>VOLUME</dt><dd>{(measurements.volume * 1e9).toFixed(1)} mm³</dd>
                <dt>SURFACE</dt><dd>{(measurements.area * 1e6).toFixed(1)} mm²</dd>
                <dt>CURVATURE</dt><dd>{measurements.curvature}</dd>
                <dt>MASS</dt><dd>{mass == null ? 'UNVERIFIED' : `${mass.toFixed(4)} kg · ASSUMED solid envelope`}</dd>
                <dt>FEATURES</dt><dd>{featureCount}</dd>
                <dt>INTERFACES</dt><dd>{localInterfaces.length}</dd>
              </dl>
            </section>
            <section>
              <h3>MATERIAL <em>{material ? 'SOURCE' : 'UNVERIFIED'}</em></h3>
              <dl>
                <dt>SPECIFICATION</dt><dd>{material?.name ?? part.material ?? 'UNVERIFIED'}</dd>
                <dt>DENSITY</dt><dd>{density == null ? 'UNVERIFIED' : `${density} kg/m³`}</dd>
                <dt>COMPOSITION</dt><dd>UNVERIFIED · chemistry percentages require a material certificate or catalog source</dd>
                <dt>APPEARANCE</dt><dd>{material?.appearance ?? 'UNVERIFIED'}</dd>
                <dt>NOTES</dt><dd>{material?.notes ?? '—'}</dd>
              </dl>
              <button className="part-lab-expand" onClick={() => setCostOpen((open) => !open)}>{costOpen ? '▾' : '▸'} COST + NESTED BOM COMPILER</button>
              {costOpen && (
                <div className="cost-compiler">
                  <label>QUANTITY<input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} /></label>
                  <label>MATERIAL $/KG<input type="number" min="0" step="0.01" value={materialRate} onChange={(e) => setMaterialRate(Number(e.target.value))} /></label>
                  <label>PROCESS $/UNIT<input type="number" min="0" step="0.01" value={processCost} onChange={(e) => setProcessCost(Number(e.target.value))} /></label>
                  <dl><dt>EST. UNIT</dt><dd>{unitCost == null || materialRate === 0 ? 'UNVERIFIED' : `${money(unitCost)} · ASSUMED inputs`}</dd><dt>EST. EXTENDED</dt><dd>{unitCost == null || materialRate === 0 ? 'UNVERIFIED' : money(unitCost * qty)}</dd></dl>
                  <h4>ASSEMBLY CONTEXT</h4>
                  {contextParts.map((item) => <div className="cost-line" key={item.id}><span>{item.name}</span><b>× {item.qty}</b><em>UNPRICED</em></div>)}
                </div>
              )}
            </section>
            <section>
              <h3>AGENT ENGINEERING CONTEXT <em>ADAPTIVE</em></h3>
              <p>Agents receive this part, its features, interfaces, material evidence, parent assembly context, and current revision. External research must be cited; unsupported simulation remains labeled.</p>
              <button onClick={async () => { setSaving(true); try { await onSaveLibrary(); } finally { setSaving(false); } }} disabled={saving}>{saving ? 'SAVING…' : 'SAVE REFINED PART TO LIBRARY'}</button>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
