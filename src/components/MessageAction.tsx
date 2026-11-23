import type { ComponentPropsWithoutRef } from 'react';

export function MessageAction(props: Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'type'>) {
  return <button type="button" className="text-button message-action" {...props} />;
}
