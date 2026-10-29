import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Button, Container, Stack, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';
import { useAuthContext } from '../AuthContext';
import RegistrationForm from '../RegistrationForm';

function Invite () {
  const { user, setUser } = useAuthContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { inviteId } = useParams();

  const { data: invite, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['invite', inviteId],
    queryFn: () => Api.invites.get(inviteId).then(response => response.data),
    retry: (count, error) => ![404, 410, 422].includes(error.response?.status) && count < 2,
  });

  const signOut = useMutation({
    mutationFn: () => Api.auth.logout(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(['users', 'me'], null);
      setUser(null);
    },
  });

  const unavailable = [404, 410, 422].includes(error?.response?.status);

  const onSubmitMutation = useMutation({
    mutationFn: (values) => Api.auth.register({ ...values, inviteId }),
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
        <title>You&apos;re Invited</title>
      </Head>
      <Container>
        <Title mb='md'>You&apos;re Invited</Title>
        <Stack>
          {isPending && <Alert>Loading invitation...</Alert>}
          {isError && (
            <Alert color='red'>
              {unavailable ? 'This invitation link is invalid, has already been used, or is no longer available. Ask an administrator for a new invitation.' : 'Unable to load this invitation. Please try again.'}
            </Alert>
          )}
          {isError && !unavailable && <Button loading={isFetching} onClick={() => refetch()}>Try again</Button>}
          {!isError && invite && (user
            ? (
              <>
                <Alert>You are signed in as {user.email}. Log out before accepting an invitation for another account.</Alert>
                {signOut.error && <Alert color='red'>{signOut.error._form || 'Unable to log out. Please try again.'}</Alert>}
                <Button loading={signOut.isPending} onClick={() => signOut.mutate()}>Log out to accept invitation</Button>
              </>
              )
            : <RegistrationForm onSubmitMutation={onSubmitMutation} />)}
          <Link to={user ? '/account' : '/login'}>{user ? 'Back to your account' : 'Back to login'}</Link>
        </Stack>
      </Container>
    </>
  );
}
export default Invite;
