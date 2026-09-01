# adapter: kernel-build123d

Phase 1 implementation lives in `workers/cad-occt/archeon_cad/kernel.py` (`Build123dKernelAdapter`).

This directory exists so the kernel remains a **replaceable adapter**, not the application architecture.

Used only when `import build123d` succeeds. Otherwise the primitive STEP writer is selected and the UI reports `kernel=primitive`.
