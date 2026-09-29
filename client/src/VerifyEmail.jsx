import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Container, Stack, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { Head } from '@unhead/react';
import { authClient } from './auth-client';

export default function VerifyEmail () {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const verification = useMutation({
    mutationFn: () => authClient.verifyEmail({ query: { token } }),
    onSuccess: () => navigate('/login', { replace: true, state: { flash: 'Email verified. You can now sign in.' } }),
  });

  return (
    <>
      <Head><title>Verify your email</title></Head>
      <Container>
        <Stack w={{ base: '100%', xs: 320 }}>
          <Title>Verify your email</Title>
          {!token && <Alert color='red'>This verification link is invalid.</Alert>}
          {verification.error && <Alert color='red'>{verification.error.message}</Alert>}
          {token && <Button loading={verification.isPending} onClick={() => verification.mutate()}>Verify email</Button>}
          <Link to='/login'>Sign in or request another verification email</Link>
        </Stack>
      </Container>
    </>
  );
}
