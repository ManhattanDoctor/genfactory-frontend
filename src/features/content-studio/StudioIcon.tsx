import type { ReactElement } from 'react';
import icons from './icons.json';

export function Icon({ name }: { name: keyof typeof icons }): ReactElement {
  return <span className="content-original-icon" dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}
