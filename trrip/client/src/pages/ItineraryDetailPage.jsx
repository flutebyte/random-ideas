import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { TripMeta } from '../components/itinerary/TripMeta';
import { DayBlock } from '../components/itinerary/DayBlock';
import { ShareToggle } from '../components/itinerary/ShareToggle';
import { ExportButton } from '../components/itinerary/ExportButton';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { useItinerary } from '../hooks/useItinerary';
import { deleteItinerary, regenerateItinerary, getItineraryStatus, getItinerary } from '../api/itinerary';
import { useToast } from '../context/ToastContext';
import { POLL_INTERVAL_MS } from '../utils/constants';

export const ItineraryDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { itinerary, setItinerary, loading, error } = useItinerary(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Poll if still generating
  useEffect(() => {
    if (!itinerary) return;
    if (itinerary.itinerary?.status === 'generating' || itinerary.itinerary?.status === 'pending') {
      const timer = setInterval(async () => {
        try {
          const res = await getItineraryStatus(id);
          if (res.data.status === 'done') {
            const full = await getItinerary(id);
            setItinerary(full.data.itinerary);
            clearInterval(timer);
          } else if (res.data.status === 'failed') {
            setItinerary((prev) => ({
              ...prev,
              itinerary: { ...prev.itinerary, status: 'failed', error: res.data.error },
            }));
            clearInterval(timer);
          }
        } catch {}
      }, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }
  }, [id, itinerary?.itinerary?.status, setItinerary]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteItinerary(id);
      toast.success('Itinerary deleted');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to delete itinerary');
      setDeleting(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerateItinerary(id);
      setItinerary((prev) => ({
        ...prev,
        itinerary: { ...prev.itinerary, status: 'generating', days: [] },
      }));
      toast.info('Regenerating itinerary...');
    } catch {
      toast.error('Failed to start regeneration');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-4">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{error || 'Itinerary not found'}</p>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to My Trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  const genStatus = itinerary.itinerary?.status;
  const days = itinerary.itinerary?.days || [];

  return (
    <div className="flex min-h-screen flex-col print:block">
      <Navbar />
      <main className="flex-1">
        <div className="container max-w-3xl py-8">
          {/* Back + actions */}
          <div className="flex items-center justify-between mb-6 print:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                My Trips
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <ExportButton />
              <ShareToggle itinerary={itinerary} onUpdate={setItinerary} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                className="gap-1.5 text-muted-foreground"
                title="Regenerate itinerary"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Trip metadata banner */}
          <TripMeta extractedData={itinerary.extractedData} title={itinerary.title} />

          {/* Generation status */}
          <div className="mt-6">
            {genStatus === 'generating' || genStatus === 'pending' ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border bg-muted/50 py-12">
                <Spinner />
                <p className="text-muted-foreground">Generating your itinerary...</p>
              </div>
            ) : genStatus === 'failed' ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 py-12 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Generation failed</p>
                  {itinerary.itinerary?.error && (
                    <p className="text-sm text-muted-foreground mt-1">{itinerary.itinerary.error}</p>
                  )}
                </div>
                <Button onClick={handleRegenerate} variant="outline" size="sm">
                  Try again
                </Button>
              </div>
            ) : days.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center text-muted-foreground">
                <p>No itinerary days found.</p>
                <Button onClick={handleRegenerate} variant="outline" size="sm">
                  Generate itinerary
                </Button>
              </div>
            ) : (
              <div className="space-y-3 mt-2">
                {days.map((day) => (
                  <DayBlock key={day.dayNumber} day={day} defaultOpen={day.dayNumber === 1} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete itinerary">
        <p className="text-sm text-muted-foreground mb-6">
          Are you sure you want to delete &quot;{itinerary.title}&quot;? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
