import { useNavigate, Link } from 'react-router';
import { Box, Container, Stack, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from './Api';
import RegistrationForm from './RegistrationForm';

function Register () {
  const navigate = useNavigate();

  const onSubmitMutation = useMutation({
    mutationFn: (values) => Api.auth.register(values),
    onSuccess: (_, values) => navigate('/login', {
      state: {
        flash: values.registrationMethod === 'magic-link'
          ? 'Check your inbox for a link to complete registration and log in. If you already have an account, the link will log you in.'
          : 'Please check your email to verify your account before logging in.',
      }
    }),
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
