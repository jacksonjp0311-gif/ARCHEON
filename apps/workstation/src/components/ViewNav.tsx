import { applyMechanicalOp } from '../services/mechanicalOps';
import { useUi } from '../store';

export function ViewNav() {
  const dispatch = useUi((s) => s.dispatch);
  const spatialUndo = useUi((s) => s.spatialUndo);
  return (
    <div className="view-nav">
      <button type="button" title="Assembled home view" onClick={() => applyMechanicalOp('home', null, null)}>HOME</button>
      <button type="button" title="Fit the whole machine" onClick={() => dispatch({ op: 'fit_scene' })}>FIT</button>
      <button type="button" title="Fit selection" onClick={() => dispatch({ op: 'fit_selection' })}>SEL</button>
      <button type="button" title="Previous spatial step, then camera — VIEW UNDO" onClick={() => applyMechanicalOp('previous', null, null)}>← VIEW</button>
      <button type="button" title="Restore assembled display. Clears the spatial conversation." onClick={() => applyMechanicalOp('restore', null, null)}>RESTORE</button>
      <button type="button" title="Undo last spatial automation" onClick={() => spatialUndo()}>SPATIAL UNDO</button>
      <div className="view-cube" aria-hidden="true">
        <button type="button" onClick={() => dispatch({ op: 'align_camera', axis: 'y' })}>Y</button>
        <button type="button" onClick={() => dispatch({ op: 'align_camera', axis: 'x' })}>X</button>
        <button type="button" onClick={() => dispatch({ op: 'align_camera', axis: 'z' })}>Z</button>
      </div>
    </div>
  );
}
