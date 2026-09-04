import type { HudId } from '../services/hudManager';
import { HudShell } from './HudShell';

interface Props {
  id: HudId;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  workspace?: boolean;
}

export function FloatingHud({ id, title, children, wide, workspace }: Props) {
  return (
    <HudShell id={id} title={title} wide={wide} workspace={workspace}>
      {children}
    </HudShell>
  );
}
