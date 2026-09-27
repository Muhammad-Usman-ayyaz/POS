import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  pending = false,
  onConfirm,
  onCancel,
}) => (
  <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-10 px-space-lg rounded-lg bg-error text-on-error font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60"
          disabled={pending}
          onClick={onConfirm}
          type="button"
        >
          {pending ? 'Working...' : confirmLabel}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
