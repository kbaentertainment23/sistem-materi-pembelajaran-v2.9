import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  itemName: string;
  itemType?: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title = 'Konfirmasi Hapus',
  itemName,
  itemType = 'Data',
  description,
  onConfirm,
  onClose,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div 
      id="modal-confirm-delete"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        id="modal-confirm-delete-content"
        className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4 animate-scaleUp relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          id="btn-close-delete-modal"
          disabled={isDeleting}
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          title="Tutup Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Header */}
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1 pr-6">
            <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Tindakan ini permanen dan tidak dapat dibatalkan.
            </p>
          </div>
        </div>

        {/* Details Box */}
        <div className="bg-rose-50/60 border border-rose-100/80 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
          {description ? (
            <p className="font-semibold text-slate-800">{description}</p>
          ) : (
            <p>
              Apakah Anda yakin ingin menghapus {itemType} <strong className="text-rose-700 font-black">"{itemName}"</strong>?
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            id="btn-cancel-delete"
            disabled={isDeleting}
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            id="btn-confirm-delete-action"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer shadow-md shadow-rose-200 flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menghapus...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
