import { useNavigate, useParams, useSearchParams, Link } from 'react-router';
import { Alert, Box, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';

function ResetPassword () {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = params.token || searchParams.get('token');

  const form = useForm({
    initialValues: {
      password: '',
    },
    validate: {
      password: hasLength({ min: 8, max: 128 }, 'Passwords must be between 8 and 128 characters.'),
    },
  });

  const onSubmitMutation = useMutation({
    mutationFn: (values) => Api.passwords.update(token, values.password),
    onSuccess: () => navigate('/login', { state: { flash: 'Your new password has been saved.' } }),
    onError: (errors) => form.setErrors(errors),
    onSettled: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  return (
    <>
      <Head>
        <title>Reset your password</title>
        <meta name='referrer' content='no-referrer' />
      </Head>
      <Container>
        <Title mb='md'>Reset your password</Title>
        <form onSubmit={form.onSubmit(onSubmitMutation.mutateAsync)}>
          <Fieldset disabled={onSubmitMutation.isPending} variant='unstyled'>
            <Stack w={{ base: '100%', xs: 320 }}>
              {!token && (
                <Alert color='red'>
                  Sorry, this password reset link is invalid.<br />
                  <Link to='/passwords/forgot'>Request another?</Link>
                </Alert>
              )}
              {form.errors._form && (
                <Alert color='red'>
                  {form.errors._form}<br />
                  <Link to='/passwords/forgot'>Request another?</Link>
                </Alert>
              )}
              {token && (
                <>
                  <Box>Enter a new password for your account.</Box>
                  <TextInput
                    {...form.getInputProps('password')}
                    key='password'
                    label='New password'
                    type='password'
                  />
                  <Group>
                    <Button type='submit'>
                      Submit
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Fieldset>
        </form>
      </Container>
    </>
  );
}

export default ResetPassword;
