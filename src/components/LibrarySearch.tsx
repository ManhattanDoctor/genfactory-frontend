import { Search } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import './library-search.css';

export function LibrarySearch(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="library-search">
      <Search size={16} strokeWidth={1.7} aria-hidden="true" />
      <input {...props} />
    </label>
  );
}
