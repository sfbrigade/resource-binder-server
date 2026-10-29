import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router';
import { Alert, Box, Button, Container, Fieldset, Radio, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, isEmail, useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from './Api';
import { useAuthContext } from './AuthContext';
import { useStaticContext } from './StaticContext';
import { loginDestination } from './LoginDestination';

function Login () {
  const staticContext = useStaticContext();
  const authContext = useAuthContext();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loginMethod, setLoginMethod] = useState('magic-link');

  const from = loginDestination(location.state?.from || searchParams.get('from'));
  const flash = location.state?.flash || (searchParams.get('passwordReset') === 'success' ? 'Your new password has been saved.' : null);

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
      password: (value) => loginMethod === 'password'
        ? hasLength({ min: 8 }, 'Passwords must be at least 8 characters.')(value)
        : null,
    },
  });

  const onSubmitMutation = useMutation({
    mutationFn: ({ email, password }) => Api.auth.login(email, password),
    onSuccess: (response) => queryClient.setQueryData(['users', 'me'], response.data),
    onError: (errors) => form.setErrors(errors),
    onSettled: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  const verificationMutation = useMutation({
    mutationFn: () => Api.auth.sendVerificationEmail(form.getValues().email),
    onError: (errors) => form.setErrors(errors),
  });

  const magicLinkMutation = useMutation({
    mutationFn: (email) => Api.auth.sendMagicLink(email, from),
  });

  function onSubmit (values) {
    if (loginMethod === 'password') {
      onSubmitMutation.mutate(values);
    } else {
      magicLinkMutation.mutate(values.email);
    }
  }

  function onLoginMethodChange (value) {
    setLoginMethod(value);
    form.clearErrors();
    onSubmitMutation.reset();
    verificationMutation.reset();
    magicLinkMutation.reset();
  }

  return (
    <>
      <Head>
        <title>Log in</title>
      </Head>
      <Container>
        <Title mb='md'>Log in</Title>
        <form onSubmit={form.onSubmit(onSubmit)}>
          <Fieldset disabled={onSubmitMutation.isPending || magicLinkMutation.isPending || verificationMutation.isPending} variant='unstyled'>
            <Stack w={{ base: '100%', xs: 320 }}>
              {flash && <Alert>{flash}</Alert>}
              {form.errors._form && <Alert color='red'>{form.errors._form}</Alert>}
              {form.errors._code === 'EMAIL_NOT_VERIFIED' && (
                <Button variant='light' loading={verificationMutation.isPending} onClick={() => verificationMutation.mutate()}>
                  Resend verification email
                </Button>
              )}
              {verificationMutation.isSuccess && <Alert>Please check your email for a verification link.</Alert>}
              <TextInput
                {...form.getInputProps('email')}
                key={form.key('email')}
                label='Email'
                type='email'
                autoComplete='email'
              />
              <Radio.Group label='Login method' value={loginMethod} onChange={onLoginMethodChange}>
                <Stack mt='xs'>
                  <Radio value='magic-link' label='Email me a login link' />
                  <Radio value='password' label='Log in with password' />
                  {loginMethod === 'password' && (
                    <TextInput
                      {...form.getInputProps('password')}
                      key={form.key('password')}
                      label='Password'
                      type='password'
                      autoComplete='current-password'
                    />
                  )}
                </Stack>
              </Radio.Group>
              <Button type='submit' loading={onSubmitMutation.isPending || magicLinkMutation.isPending}>
                {loginMethod === 'password' ? 'Log in with password' : 'Email me a login link'}
              </Button>
              {magicLinkMutation.error && <Alert color='red'>{magicLinkMutation.error._form}</Alert>}
              {magicLinkMutation.isSuccess && <Alert>If this email belongs to an eligible account, a login link will arrive shortly. Check your inbox.</Alert>}
              <Box>
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
