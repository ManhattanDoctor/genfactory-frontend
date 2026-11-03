import { useAuth } from '../features/auth/AuthProvider';
import type { IGnosisFile } from '../lib/types';
import { Modal } from './Modal';
import { FileBrowser } from './FileBrowser';
export function LibraryPicker({
  onPick,
  onClose,
  selected = [],
  imagesOnly = true,
  acceptedTypes,
}: {
  onPick: (file: IGnosisFile) => void;
  onClose: () => void;
  selected?: number[];
  imagesOnly?: boolean;
  acceptedTypes?: string[];
}) {
  const { user } = useAuth();
  return (
    <Modal title={imagesOnly ? 'Выбрать референс' : 'Выбрать материал'} onClose={onClose} wide>
      <FileBrowser
        key={user?.id}
        selected={selected}
        acceptedTypes={acceptedTypes || (imagesOnly ? ['IMAGE'] : ['IMAGE', 'DOCUMENT', 'AUDIO'])}
        onOpen={(file) => {
          onPick(file);
          onClose();
        }}
      />
    </Modal>
  );
}
