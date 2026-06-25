import { Link } from 'react-router-dom';
import { Upload, Sparkles, Globe, Plane, FileText, Map } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    icon: Upload,
    title: 'Upload any booking',
    description: 'Drop your flight tickets, hotel confirmations, or activity vouchers — PDFs and images both work.',
  },
  {
    icon: Sparkles,
    title: 'AI extracts the details',
    description: 'Gemini Vision reads your documents and pulls out flights, hotels, dates, and confirmation codes automatically.',
  },
  {
    icon: Map,
    title: 'Get a full itinerary',
    description: 'A complete day-by-day plan is generated, filling in local activities, meals, and transport around your bookings.',
  },
  {
    icon: Globe,
    title: 'Share with anyone',
    description: 'Toggle a link to make your itinerary public. Send it to travel companions or post it online.',
  },
];

export const LandingPage = () => {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="py-24 md:py-36">
          <div className="container flex flex-col items-center text-center gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Powered by Google Gemini
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
              Turn your bookings into a{' '}
              <span className="text-primary">perfect itinerary</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Upload your flight and hotel confirmations. Our AI reads them and builds a complete day-by-day travel plan in seconds.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link to={user ? '/upload' : '/register'}>
                  <Plane className="mr-2 h-4 w-4" />
                  Plan my trip
                </Link>
              </Button>
              {!user && (
                <Button variant="outline" size="lg" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              No credit card required · Works with PDF and image uploads
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 bg-muted/40">
          <div className="container">
            <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => (
                <Card key={i} className="border-0 bg-transparent shadow-none">
                  <CardContent className="pt-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <f.icon className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="container flex flex-col items-center text-center gap-6">
            <h2 className="text-3xl font-bold">Ready to plan smarter?</h2>
            <p className="text-muted-foreground">Join travellers who let AI handle the planning.</p>
            <Button size="lg" asChild>
              <Link to={user ? '/upload' : '/register'}>Get started for free</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};
