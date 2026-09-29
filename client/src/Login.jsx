import { useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router';
import { Alert, Box, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { isNotEmpty, isEmail, useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import { authClient } from './auth-client';
import { useAuthContext } from './AuthContext';
import { useStaticContext } from './StaticContext';

function Login () {
  const staticContext = useStaticContext();
  const authContext = useAuthContext();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const from = location.state?.from || searchParams.get('from') || '/';

  useEffect(() => {
    if (authContext.user) {
      navigate(from, { replace: true });
    }
  }, [authContext.user, from, navigate]);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: isEmail('Please enter a valid email address.'),
      password: isNotEmpty('Enter your password.'),
    },
  });

  const onSubmitMutation = useMutation({
    mutationFn: ({ email, password }) => authClient.signIn.email({ email, password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
    onError: (error) => form.setErrors({ _form: error.message }),
    onSettled: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });
  const verification = useMutation({
    mutationFn: () => authClient.sendVerificationEmail({ email: form.getValues().email }),
  });

  return (
    <>
      <Head>
        <title>Log in</title>
      </Head>
      <Container>
        <Title mb='md'>Log in</Title>
        <form onSubmit={form.onSubmit(onSubmitMutation.mutate)}>
          <Fieldset disabled={onSubmitMutation.isPending} variant='unstyled'>
            <Stack w={{ base: '100%', xs: 320 }}>
              {location.state?.flash && <Alert>{location.state?.flash}</Alert>}
              {form.errors._form && <Alert color='red'>{form.errors._form}</Alert>}
              {verification.error && <Alert color='red'>{verification.error.message}</Alert>}
              {verification.isSuccess && <Alert>If your account needs verification, check your email for a new link.</Alert>}
              <TextInput
                {...form.getInputProps('email')}
                key={form.key('email')}
                label='Email'
              />
              <TextInput
                {...form.getInputProps('password')}
                key={form.key('password')}
                label='Password'
                type='password'
              />
              <Group>
                <Button type='submit'>
                  Submit
                </Button>
              </Group>
              <Box>
                <Button
                  variant='subtle' loading={verification.isPending} onClick={() => {
                    if (!form.validateField('email').hasError) verification.mutate();
                  }}
                >Resend verification email
                </Button>
                <br />
                <Link to='/passwords/forgot'>Forgot your password?</Link>
                {staticContext?.env?.VITE_FEATURE_REGISTRATION === 'true' && (
                  <>
                    <br />
                    <Link to='/register'>Need an account?</Link>
                  </>
                )}
              </Box>
            </Stack>
          </Fieldset>
        </form>
      </Container>
    </>
  );
}

export default Login;
