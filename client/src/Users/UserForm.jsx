import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { Alert, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';
import { useAuthContext } from '../AuthContext';
import PhotoInput from '../Components/PhotoInput';
import UserCredentials from './UserCredentials';

function UserForm () {
  const authContext = useAuthContext();
  const location = useLocation();
  const params = useParams();
  const userId = params.userId ?? authContext.user.id;
  const queryClient = useQueryClient();

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      firstName: '',
      lastName: '',
      picture: '',
    },
    validate: {
      firstName: isNotEmpty('First name is required.'),
      lastName: isNotEmpty('Last name is required.'),
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
    mutationFn: ({ firstName, lastName, picture }) => Api.users.update(userId, { firstName, lastName, picture: picture || null }),
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
        <form onSubmit={form.onSubmit(onSubmitMutation.mutate)}>
          <Fieldset disabled={isLoading} variant='unstyled'>
            <Stack w={{ base: '100%', xs: 320 }}>
              {location.state?.flash && <Alert>{location.state?.flash}</Alert>}
              {form.errors?._form && <Alert color='red'>{form.errors._form}</Alert>}
              {success && <Alert>Your account has been updated!</Alert>}
              <PhotoInput
                {...form.getInputProps('picture')}
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
              <TextInput value={response?.data.email ?? ''} label='Email' readOnly />
              <Group>
                <Button disabled={onSubmitMutation.isPending} type='submit'>Submit</Button>
              </Group>
            </Stack>
          </Fieldset>
        </form>
        {response && <UserCredentials key={userId} user={response.data} />}
      </Container>
    </>
  );
}

export default UserForm;
