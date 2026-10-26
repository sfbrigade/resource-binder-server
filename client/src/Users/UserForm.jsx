import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert, Button, Container, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';
import { useAuthContext } from '../AuthContext';
import PhotoInput from '../Components/PhotoInput';
import UserRoleForm from './UserRoleForm';

function UserForm () {
  const authContext = useAuthContext();
  const location = useLocation();
  const params = useParams();
  const userId = params.userId ?? authContext.user.id;
  const editingSelf = userId === authContext.user.id;
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      firstName: '',
      lastName: '',
      picture: null,
    },
    validate: {
      firstName: hasLength({ min: 2, max: 30 }, 'First name must be between 2 and 30 characters long.'),
      lastName: hasLength({ min: 2, max: 30 }, 'Last name must be between 2 and 30 characters long.'),
    },
  });

  const { data: response, isLoading, isError } = useQuery({
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
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      queryClient.setQueryData(['users', userId], response);
      if (editingSelf) {
        queryClient.setQueryData(['users', 'me'], response.data);
        authContext.setUser(response.data);
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccess(true);
    },
    onError: (errors) => form.setErrors(errors),
    onSettled: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  return (
    <>
      <Head>
        <title>{editingSelf ? 'My Account' : 'Edit User'}</title>
      </Head>
      <Container>
        <Title mb='md'>{editingSelf ? 'My Account' : 'Edit User'}</Title>
        {isLoading && <Alert>Loading user...</Alert>}
        {isError && <Alert color='red'>Unable to load this user. Please try again.</Alert>}
        {response && (
          <Stack w={{ base: '100%', xs: 400 }}>
            <form onSubmit={form.onSubmit(onSubmitMutation.mutate)}>
              <Fieldset disabled={onSubmitMutation.isPending} legend='Profile'>
                <Stack>
                  {location.state?.flash && <Alert>{location.state.flash}</Alert>}
                  {form.errors._form && <Alert color='red'>{form.errors._form}</Alert>}
                  {success && <Alert>Your account has been updated!</Alert>}
                  <PhotoInput
                    {...form.getInputProps('picture')}
                    key={form.key('picture')}
                    label='Picture'
                    valueUrl={response.data.pictureUrl}
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
                  <TextInput value={response.data.email} label='Email' type='email' readOnly />
                  {editingSelf && <Link to='/passwords/forgot'>Reset your password</Link>}
                  <Group>
                    <Button type='submit'>Save profile</Button>
                  </Group>
                </Stack>
              </Fieldset>
            </form>
            {authContext.user.isAdmin && <UserRoleForm user={response.data} />}
          </Stack>
        )}
      </Container>
    </>
  );
}

export default UserForm;
