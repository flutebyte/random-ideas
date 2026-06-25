import { Navigate } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RegisterForm } from '../components/auth/RegisterForm';

export const RegisterPage = () => {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/30">
      <div className="mb-8 flex items-center gap-2 text-2xl font-bold text-primary">
        <Plane className="h-6 w-6" />
        Trrip
      </div>
      <RegisterForm />
    </div>
  );
};
