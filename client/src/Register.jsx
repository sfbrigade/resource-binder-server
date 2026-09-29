import { useNavigate, Link } from 'react-router';
import { Box, Container, Stack, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import { authClient } from './auth-client';
import RegistrationForm from './RegistrationForm';

function Register () {
  const navigate = useNavigate();

  const onSubmitMutation = useMutation({
    mutationFn: (values) => authClient.signUp.email({ ...values, name: `${values.firstName} ${values.lastName}` }),
    onSuccess: () => navigate('/login', { state: { flash: 'Check your email to verify your account before signing in.' } }),
    onError: () => window.scrollTo(0, 0),
  });

  return (
    <>
      <Head>
        <title>Register</title>
      </Head>
      <Container>
        <Title mb='md'>Register</Title>
        <Stack>
          <RegistrationForm onSubmitMutation={onSubmitMutation} />
          <Box>
            <Link to='/login'>Already have an account?</Link>
          </Box>
        </Stack>
      </Container>
    </>
  );
}

export default Register;
