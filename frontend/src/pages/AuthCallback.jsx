import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleCallback } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      handleCallback(token)
        .then(() => navigate('/'))
        .catch(() => navigate('/?error=auth_failed'));
    } else {
      navigate('/?error=no_token');
    }
  }, [searchParams, handleCallback, navigate]);

  return (
    <div className="loading">
      Logging you in...
    </div>
  );
};

export default AuthCallback;
