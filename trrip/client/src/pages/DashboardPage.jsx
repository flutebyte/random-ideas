import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { ItineraryList } from '../components/itinerary/ItineraryList';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useItineraries } from '../hooks/useItineraries';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = () => {
  const { user } = useAuth();
  const { data, loading, error, pagination, refetch } = useItineraries();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="container py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">My Trips</h1>
              <p className="text-muted-foreground mt-1">
                Welcome back, {user?.name?.split(' ')[0]}
                {pagination.total > 0 && ` · ${pagination.total} trip${pagination.total !== 1 ? 's' : ''}`}
              </p>
            </div>
            <Button asChild>
              <Link to="/upload" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New trip
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-24">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-24 text-center">
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => refetch(1)} className="gap-1.5">
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : (
            <ItineraryList itineraries={data} />
          )}

          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === pagination.page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => refetch(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};
