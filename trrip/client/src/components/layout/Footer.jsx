import { Plane } from 'lucide-react';

export const Footer = () => (
  <footer className="border-t py-8 mt-auto">
    <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Plane className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">Trrip</span>
        <span>— AI-powered travel planning</span>
      </div>
      <p>© {new Date().getFullYear()} Trrip. All rights reserved.</p>
    </div>
  </footer>
);
