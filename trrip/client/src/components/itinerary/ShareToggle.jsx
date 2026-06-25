import { useState } from 'react';
import { Globe, Lock, Copy, Check, Share2 } from 'lucide-react';
import { toggleShare } from '../../api/itinerary';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export const ShareToggle = ({ itinerary, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const shareUrl = itinerary.slug
    ? `${window.location.origin}/share/${itinerary.slug}`
    : null;

  const handleToggle = async (isPublic) => {
    setLoading(true);
    try {
      await toggleShare(itinerary._id, isPublic);
      onUpdate({ ...itinerary, isPublic });
      toast.success(isPublic ? 'Itinerary is now public' : 'Itinerary is now private');
    } catch {
      toast.error('Failed to update sharing settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Share itinerary">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {itinerary.isPublic ? (
                <Globe className="h-5 w-5 text-green-600" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {itinerary.isPublic ? 'Anyone with the link' : 'Only you'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {itinerary.isPublic
                    ? 'This itinerary is publicly accessible'
                    : 'This itinerary is private'}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(!itinerary.isPublic)}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                itinerary.isPublic ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  itinerary.isPublic ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {itinerary.isPublic && shareUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Share link</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 flex-shrink-0">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
