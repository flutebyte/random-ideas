import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-4">
    <MapPin className="h-12 w-12 text-muted-foreground" />
    <h1 className="text-4xl font-bold">404</h1>
    <p className="text-lg text-muted-foreground">This page doesn&apos;t exist.</p>
    <Button asChild>
      <Link to="/">Go home</Link>
    </Button>
  </div>
);
