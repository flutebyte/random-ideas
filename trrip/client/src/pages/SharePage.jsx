import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plane, AlertCircle, Globe } from 'lucide-react';
import apiClient from '../api/client';
import { TripMeta } from '../components/itinerary/TripMeta';
import { DayBlock } from '../components/itinerary/DayBlock';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

export const SharePage = () => {
  const { slug } = useParams();
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get(`/share/${slug}`)
      .then((res) => setItinerary(res.data.itinerary))
      .catch((err) => setError(err.response?.data?.message || 'Itinerary not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Itinerary not found</h1>
        <p className="text-muted-foreground">This link may have been disabled or doesn&apos;t exist.</p>
        <Button asChild>
          <Link to="/">Go to Trrip</Link>
        </Button>
      </div>
    );
  }

  const days = itinerary.itinerary?.days || [];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Minimal navbar */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-primary">
            <Plane className="h-4 w-4" />
            Trrip
          </Link>
          <Button size="sm" asChild>
            <Link to="/register">Plan your own trip</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <div className="container max-w-3xl py-8">
          {/* Shared-by banner */}
          <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>
              Shared by <strong className="text-foreground">{itinerary.owner?.name}</strong>
              {' '}· View-only itinerary
            </span>
          </div>

          <TripMeta extractedData={itinerary.extractedData} title={itinerary.title} />

          <div className="mt-6 space-y-3">
            {days.map((day) => (
              <DayBlock key={day.dayNumber} day={day} defaultOpen={day.dayNumber === 1} />
            ))}
            {days.length === 0 && (
              <p className="py-12 text-center text-muted-foreground">
                No itinerary generated yet.
              </p>
            )}
          </div>

          {/* CTA */}
          <div className="mt-12 rounded-xl border bg-primary/5 p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Plan your own AI itinerary</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Upload your flight and hotel bookings to get a full day-by-day plan in seconds.
            </p>
            <Button asChild size="lg">
              <Link to="/register">Get started for free</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary transition-colors font-medium">Trrip</Link>
        {' '}— AI-powered travel planning
      </footer>
    </div>
  );
};
