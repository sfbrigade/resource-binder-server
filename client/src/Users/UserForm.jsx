import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';
import { useAuthContext } from '../AuthContext';
import PhotoInput from '../Components/PhotoInput';

function UserForm () {
  const authContext = useAuthContext();
  const queryClient = useQueryClient();
  const location = useLocation();
  const params = useParams();
  const userId = params.userId ?? authContext.user.id;

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      firstName: '',
      lastName: '',
      picture: null,
    },
    validate: {
      firstName: hasLength({ min: 2, max: 30 }, 'First name must be between 2 and 30 characters.'),
      lastName: hasLength({ min: 2, max: 30 }, 'Last name must be between 2 and 30 characters.'),
    },
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => Api.users.get(userId),
    enabled: !!userId,
  });

  useEffect(() => {
    if (response) {
      form.initialize({
        firstName: response.data.firstName,
        lastName: response.data.lastName,
        picture: response.data.picture,
      });
    }
  }, [response]);

  const onSubmitMutation = useMutation({
    mutationFn: (values) => Api.users.update(userId, values),
    onMutate: () => setSuccess(false),
    onSuccess: (response) => {
      queryClient.setQueryData(['users', userId], response);
      if (userId === authContext.user.id) {
        queryClient.setQueryData(['users', 'me'], response.data);
        authContext.setUser(response.data);
      }
      setSuccess(true);
    },
    onError: (errors) => form.setErrors(errors),
    onSettled: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });
  const [success, setSuccess] = useState(false);

  return (
    <>
      <Head>
        <title>My Account</title>
      </Head>
      <Container>
        <Title mb='md'>My Account</Title>
        <form onSubmit={form.onSubmit(onSubmitMutation.mutateAsync)}>
          <Fieldset disabled={isLoading || onSubmitMutation.isPending} variant='unstyled'>
            <Stack w={{ base: '100%', xs: 320 }}>
              {location.state?.flash && <Alert>{location.state?.flash}</Alert>}
              {form.errors?._form && <Alert color='red'>{form.errors._form}</Alert>}
              {success && <Alert>Your account has been updated!</Alert>}
              <PhotoInput
                {...form.getInputProps('picture')}
                key={form.key('picture')}
                label='Picture'
                valueUrl={response?.data.pictureUrl}
              />
              <TextInput
                {...form.getInputProps('firstName')}
                key={form.key('firstName')}
                label='First name'
              />
              <TextInput
                {...form.getInputProps('lastName')}
                key={form.key('lastName')}
                label='Last name'
              />
              <TextInput
                value={response?.data.email ?? ''}
                readOnly
                label='Email'
                type='email'
              />
              {userId === authContext.user.id && <Link to='/passwords/forgot'>Reset your password</Link>}
              <Group>
                <Button disabled={onSubmitMutation.isPending} type='submit'>Submit</Button>
              </Group>
            </Stack>
          </Fieldset>
        </form>
      </Container>
    </>
  );
}

export default UserForm;
