import { useNavigate, useParams, useSearchParams, Link } from 'react-router';
import { Alert, Box, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import { authClient } from '../auth-client';

function ResetPassword () {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = params.token ?? searchParams.get('token');
  const form = useForm({
    initialValues: { password: '' },
    validate: { password: hasLength({ min: 8, max: 128 }, 'Use between 8 and 128 characters.') },
  });
  const mutation = useMutation({
    mutationFn: ({ password }) => authClient.resetPassword({ token, newPassword: password }),
    onSuccess: () => navigate('/login', { replace: true, state: { flash: 'Your new password has been saved. Please sign in.' } }),
    onError: (error) => form.setErrors({ _form: error.message }),
  });

  return (
    <>
      <Head><title>Reset your password</title></Head>
      <Container>
        <Title mb='md'>Reset your password</Title>
        <Stack w={{ base: '100%', xs: 320 }}>
          {(!token || searchParams.has('error'))
            ? <Alert color='red'>This password reset link is invalid or expired.</Alert>
            : (
              <form onSubmit={form.onSubmit(mutation.mutate)}>
                <Fieldset disabled={mutation.isPending} variant='unstyled'>
                  <Stack>
                    {form.errors._form && <Alert color='red'>{form.errors._form}</Alert>}
                    <Box>Enter a new password for your account.</Box>
                    <TextInput {...form.getInputProps('password')} label='New password' type='password' autoComplete='new-password' />
                    <Group><Button type='submit'>Reset password</Button></Group>
                  </Stack>
                </Fieldset>
              </form>
              )}
          <Link to='/passwords/forgot'>Request a new reset link</Link>
        </Stack>
      </Container>
    </>
  );
}

export default ResetPassword;
