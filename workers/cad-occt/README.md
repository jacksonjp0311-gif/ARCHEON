# ARCHEON CAD worker

Exact geometry adapter. The workstation renderer is **not** this kernel.

## Kernels

| Adapter | Status |
|---|---|
| `PrimitiveKernelAdapter` | Always available. Writes ISO-10303 STEP B-rep for boxes and cylinders, plus STL tessellation. |
| `Build123dKernelAdapter` | Used only if `build123d` imports. Optional extra: `pip install build123d`. |

Zoo / FreeCAD / Fusion / Onshape adapters are stubs.

## CLI

```powershell
cd workers\cad-occt
$env:PYTHONPATH = (Get-Location)
python -m archeon_cad ping --json
python -m archeon_cad regenerate --project ..\..\projects\archeon-arm --json
```

Outputs land in `projects/archeon-arm/generated/` (gitignored).

## Honesty

- STEP boxes/cylinders from the primitive kernel **are** exact B-rep for those primitives.
- They are **not** OpenCascade feature histories, fillets, or qualified manufacturing CAD.
- STL is tessellation, never source of truth.
- Mass properties use ASSUMED/SOURCE densities from DesignIR.
- AABB interference is a heuristic unless build123d Boolean check runs.
