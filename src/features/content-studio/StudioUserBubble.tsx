import type { ReactNode } from 'react';
import { CollapsibleMessage } from './CollapsibleMessage';

export function StudioUserBubble({
  text,
  children,
  status,
}: {
  text: string;
  children?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="as-user">
      <div className="as-bubble">
        {children}
        {text && (
          <CollapsibleMessage>
            <p className="as-ask">{text}</p>
          </CollapsibleMessage>
        )}
        {status}
      </div>
    </div>
  );
}
