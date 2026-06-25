import { Printer } from 'lucide-react';
import { Button } from '../ui/Button';

export const ExportButton = () => (
  <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
    <Printer className="h-4 w-4" />
    Print
  </Button>
);
