import { Alert, Button, Fieldset, Group, Stack, TextInput, Title } from '@mantine/core';
import { hasLength, isNotEmpty, useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../auth-client';
import { useAuthContext } from '../AuthContext';

export default function UserCredentials ({ user }) {
  const { user: currentUser } = useAuthContext();
  const isSelf = user.id === currentUser.id;
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '' },
    validate: {
      currentPassword: isSelf ? isNotEmpty('Enter your current password.') : undefined,
      newPassword: hasLength({ min: 8, max: 128 }, 'Use between 8 and 128 characters.'),
    },
  });
  const password = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => isSelf
      ? authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      : authClient.admin.setUserPassword({ userId: user.id, newPassword }),
    onSuccess: () => form.reset(),
  });
  const access = useMutation({
    mutationFn: (action) => action === 'role'
      ? authClient.admin.setRole({ userId: user.id, role: user.isAdmin ? 'user' : 'admin' })
      : user.banned ? authClient.admin.unbanUser({ userId: user.id }) : authClient.admin.banUser({ userId: user.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <Stack mt='xl' w={{ base: '100%', xs: 320 }}>
      <Title order={2}>Password</Title>
      <form onSubmit={form.onSubmit(password.mutate)}>
        <Fieldset disabled={password.isPending} variant='unstyled'>
          <Stack>
            {password.error && <Alert color='red'>{password.error.message}</Alert>}
            {password.isSuccess && <Alert>Password updated.</Alert>}
            {isSelf && <TextInput {...form.getInputProps('currentPassword')} label='Current password' type='password' autoComplete='current-password' />}
            <TextInput {...form.getInputProps('newPassword')} label='New password' type='password' autoComplete='new-password' />
            <Button type='submit'>{isSelf ? 'Change password' : 'Set password and sign out user'}</Button>
          </Stack>
        </Fieldset>
      </form>
      {currentUser.isAdmin && (
        <>
          <Title order={2}>Access</Title>
          {access.error && <Alert color='red'>{access.error.message}</Alert>}
          <Group>
            <Button disabled={access.isPending} onClick={() => access.mutate('role')}>{user.isAdmin ? 'Remove administrator access' : 'Make administrator'}</Button>
            <Button disabled={access.isPending} color={user.banned ? undefined : 'red'} onClick={() => access.mutate('ban')}>{user.banned ? 'Unban user' : 'Ban user'}</Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
