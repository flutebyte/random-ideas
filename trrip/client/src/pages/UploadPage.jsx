import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { DropZone } from '../components/upload/DropZone';
import { FilePreviewList } from '../components/upload/FilePreviewList';
import { ProcessingPipeline } from '../components/upload/ProcessingPipeline';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { useUpload } from '../hooks/useUpload';

export const UploadPage = () => {
  const [files, setFiles] = useState([]);
  const [customTitle, setCustomTitle] = useState('');
  const { phase, phases, uploadProgress, error, itineraryId, processFiles, cancel, reset, isProcessing, isDone } =
    useUpload();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDone && itineraryId) {
      const timer = setTimeout(() => navigate(`/itinerary/${itineraryId}`), 800);
      return () => clearTimeout(timer);
    }
  }, [isDone, itineraryId, navigate]);

  const handleRemoveFile = (file) => {
    setFiles((prev) => prev.filter((f) => f !== file));
  };

  const handleSubmit = () => {
    if (files.length === 0) return;
    processFiles(files, customTitle.trim() || undefined);
  };

  const isShowingPipeline = isProcessing || isDone || phase === phases.ERROR;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="container max-w-2xl py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">Plan a new trip</h1>
            <p className="text-muted-foreground mt-1">
              Upload your travel documents and we&apos;ll generate a day-by-day itinerary.
            </p>
          </div>

          {!isShowingPipeline ? (
            <div className="space-y-6">
              <DropZone files={files} onFilesChange={setFiles} />
              <FilePreviewList files={files} onRemove={handleRemoveFile} />

              <div className="space-y-2">
                <Label htmlFor="title">Trip name (optional)</Label>
                <Input
                  id="title"
                  placeholder="e.g. Paris Anniversary Trip"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={files.length === 0}
                onClick={handleSubmit}
              >
                Generate itinerary
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Supports flight tickets, hotel confirmations, travel vouchers — PDF & images
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <ProcessingPipeline
                phase={phase}
                uploadProgress={uploadProgress}
                error={error}
              />
              {(phase === phases.ERROR) && (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={reset}>
                    Start over
                  </Button>
                  <Button className="flex-1" onClick={() => processFiles(files, customTitle)}>
                    Try again
                  </Button>
                </div>
              )}
              {isProcessing && (
                <Button variant="ghost" className="w-full" onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};
